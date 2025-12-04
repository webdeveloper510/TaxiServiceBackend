require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const TRIP_MODEL = require('../../models/user/trip_model.js');
const USER_MODEL = require('../../models/user/user_model.js');
const DRIVER_MODEL = require("../../models/user/driver_model");
const SUBSCRIPTION_MODEL = require("../../models/user/subscription_model");
const CONSTANT = require('../../config/constant');
const LOGS = require("../../models/user/logs_model");
const PLANS_MODEL = require("../../models/admin/plan_model");
const mongoose = require("mongoose");
const { sendPaymentFailEmail , sendEmailSubscribeSubcription } = require("../../Service/helperFuntion");
const { updateDriverMapCache , broadcastDriverLocation} = require("../../Service/location.service")

module.exports = async function subscription(req, res) {
     console.log('subscription webhook triggered----------------');
     const istTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }); 

     try {

        const endpointSecret = process.env.STRIPE_TEST_WEBHOOK_ENDPOINT_SECRET;
                  
        const sig = req.headers['stripe-signature'];
        let event;

        try {

            event = await stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
       
        } catch (err) {

            console.log('❌❌❌❌❌❌❌❌❌Error subscription:', err.message);
            let logs_data = { 
                                api_name: 'subscription_webhook', 
                                payload: JSON.stringify(req.body),
                                error_message: err.message, 
                                error_response: JSON.stringify(err)
                            };

            const logEntry = new LOGS(logs_data);
            logEntry.save();
            return res.status(200).send({ received: true , error_message: err.message , istTime:istTime});
        }

        console.log("event.type ---------" , event.type )
        // -------------------- Main Logic start
        if (event.type === 'invoice.payment_succeeded') {

            console.log("inside event tyep ---------" , event.type )
            let invoice = event.data.object;
            let updateData;

            if (invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CREATE) {

                await susbcriptionCreate(invoice , req , event)
            } else if (invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CYCLE) {
            
                await subscriptionCycle(invoice , event);
            } else if (invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.CHECKOUT || invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.MANUAL) {

                await oneTimePayment(invoice)
            } else {
              console.log("⚠️ Unknown billing reason:", invoice.billing_reason);
            }
        } else if (event.type ===`invoice.payment_failed`) { // when Payment will be failed

            const invoice = event.data.object;
            
            let logs_data = {
                api_name: 'subscription_webhook',
                payload: JSON.stringify(event),
                error_message: `Retry payment`,
                error_response: JSON.stringify(event)
            };
            const logEntry = new LOGS(logs_data);
            logEntry.save();

            handleInvoicePaymentFailure(invoice , req)
        }

        // Log the webhook event
        console.log("Webhook received successfully");
        return res.status(200).send({ received: true  , message: `Webhook received successfully for subscription webhook`, istTime:istTime});
    
     } catch (error) {
        console.log('❌❌❌❌❌❌❌❌❌Error subscription_webhook erro:', error.message);
        console.log(" subscription webhook:", error.message);
        let logs_data = {
                            api_name: 'subscription_webhook error',
                            payload: JSON.stringify(req.body),
                            error_message: error.message,
                            error_response: JSON.stringify(error)
                        };
        const logEntry = new LOGS(logs_data);
        logEntry.save();
        return res.status(200).send({ received: true , error_message: error.message , istTime:istTime});
    }
}

const oneTimePayment = async (invoice) => {

    console.log("💳 This invoice is for a **One-Time Payment**-----------" , invoice);
    try {

        const checkoutSessions = await stripe.checkout.sessions.list({
                                                                        payment_intent: invoice.payment_intent, // Find session with this invoice
                                                                        limit: 1,
                                                                    });

        if (checkoutSessions.data.length > 0) {
        
            const checkoutSessionsId = checkoutSessions.data[0].id;
            console.log("🔗 This invoice belongs to Checkout Session:", checkoutSessionsId);

            const condition = { "stripe_payment.payment_intent_id": checkoutSessionsId };
            const invoiceUpdateData =   { 
                                            $set: {
                                                hosted_invoice_url: invoice?.hosted_invoice_url,
                                                invoice_pdf: invoice?.invoice_pdf,
                                            } 
                                        };
            const option = { new: true } 
            //  Update invoice URL into our system
            const updatedTrip = await TRIP_MODEL.findOneAndUpdate(
                                                                    condition, // Find condition
                                                                    invoiceUpdateData, 
                                                                    option // Returns the updated document
                                                                );
           
        } else {
            console.log("⚠️ No matching Checkout Session found.");
        }
    } catch (error) {
        console.log('❌❌❌❌❌❌❌❌❌Error onetime payment erro:', error.message);
        console.log(" oneTimePayment webhook:", error.message);
    }
}
const susbcriptionCreate = async (invoice , req , event) => {

    try {
        // Extract relevant information
        let subscriptionId = invoice.subscription; // Subscription ID

        let subscriptionExist = await SUBSCRIPTION_MODEL.findOne({subscriptionId:subscriptionId , paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.UNPAID })
        
        let paymentIntentId = invoice.payment_intent;

        const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

        const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);

        if (paymentMethod.type === CONSTANT.INVOICE_PAYMENT_METHOD_TYPE.IDEAL ||  paymentMethod.type === CONSTANT.INVOICE_PAYMENT_METHOD_TYPE.SEPA_DEBIT) {
            console.log('This subscription was created using iDEAL.' , paymentMethod.type);

            // Store this info in your database if needed
            await idealPaymentSubscription(req , invoice , paymentMethod.type);
        } else {
            let updateData  =   {
                                    chargeId: invoice.charge,
                                    paymentIntentId: invoice.payment_intent,
                                    invoiceId: invoice.id,
                                    paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                                    active: CONSTANT.SUBSCRIPTION_STATUS.ACTIVE,
                                    invoicePdfUrl: invoice.invoice_pdf,
                                    invoiceUrl: invoice.hosted_invoice_url,
                                    billing_reason:CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CREATE
                                }
            const result    = await SUBSCRIPTION_MODEL.updateOne(
                                                                    { _id: new mongoose.Types.ObjectId(subscriptionExist._id) }, // filter
                                                                    { $set: updateData } // update operation
                                                                );
            
            // update driver profile cache
            if (subscriptionExist?.role === CONSTANT.ROLES.DRIVER) {
                const driverId = subscriptionExist?.purchaseByDriverId;
                updateDriverMapCache(driverId);
            }
            
            let logs_data = {
                                api_name: 'subscription_webhook',
                                payload: event.type,
                                error_message: `billing_reason - subscription_create`,
                                error_response: JSON.stringify(event)
                            };
            
            const logEntry = new LOGS(logs_data);
            logEntry.save();
            await sendEmailSubscribeSubcription(subscriptionId);
        }
    } catch (error) {

        console.log('❌❌❌❌❌❌❌❌❌Error subscription_we erro:', error.message);
        console.log(" subscription webhook:", error.message);
    }

}

const idealPaymentSubscription = async (req , invoice , paymentMethodType) => {

    try {

        const subscriptionId = invoice.subscription;
        // const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const planId = invoice.lines.data[0]?.price?.product;
        const customerId = invoice?.customer;
        const planDetails = await PLANS_MODEL.findOne({planId: planId});
        const userDetails = await USER_MODEL.findOne({stripeCustomerId: customerId});
        const driverDetails = await DRIVER_MODEL.findOne({stripeCustomerId: customerId});
        
        const driverId = driverDetails && driverDetails._id ? driverDetails._id : null;
        const userId = userDetails && userDetails._id ? userDetails._id : null;

        let  detail = {};
        
        if (planDetails.forRoles == CONSTANT.ROLES.COMPANY) {
            
            detail.purchaseByCompanyId = userId; 
            detail.purchaseBy = userId; 
            detail.role = CONSTANT.ROLES.COMPANY;
        } else {
            detail.purchaseByDriverId = driverId; 
            detail.purchaseBy = driverId; 
            detail.role = CONSTANT.ROLES.DRIVER;
        }

        const subscriptionLine = await invoice.lines.data.find(line => line.type === 'subscription');
        // Convert UNIX timestamps to JavaScript Date objects
        const startPeriod = new Date(subscriptionLine.period.start * 1000); // Convert to milliseconds
        const endPeriod = new Date(subscriptionLine.period.end * 1000);

        let subscriptionData =  {
              subscriptionId: subscriptionId,
              planId: planId,
              productPriceId: invoice.lines.data[0]?.price?.id,
              customerId: customerId,
              ...detail,
              chargeId: invoice.charge,
              paymentIntentId: invoice.payment_intent,
              invoiceId: invoice.id,
              paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.PAID,
              active: CONSTANT.SUBSCRIPTION_STATUS.ACTIVE,
              invoicePdfUrl: invoice.invoice_pdf,
              invoiceUrl: invoice.hosted_invoice_url,
              billing_reason: invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CREATE ? CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CREATE : CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CYCLE,
              startPeriod: startPeriod,
              endPeriod: endPeriod,
              amount: invoice.lines.data[0]?.amount_excluding_tax / 100,
              invoiceName: invoice?.number
            }
        
        const newSubscription = new SUBSCRIPTION_MODEL(subscriptionData);
        await newSubscription.save();

        // update driver profile cache
        if (detail.role === CONSTANT.ROLES.DRIVER)  updateDriverMapCache(driverId);

        const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
        const payymentMethodId = paymentIntent?.payment_method;

        if (payymentMethodId  && paymentMethodType === CONSTANT.INVOICE_PAYMENT_METHOD_TYPE.SEPA_DEBIT) {
            await stripe.paymentMethods.attach(payymentMethodId, { customer: customerId });

            // Update the default payment method for future invoices
            await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: payymentMethodId } });

            console.log('Payment method updated for future payments.');
        }

        return true;
    } catch (error) {
        console.log('❌❌❌❌❌❌❌❌❌Error ideal payment susbcription erro:', error.message);
        console.error("Error in webhook handler idealPaymentSubscription ():", error.message);
        let logs_data = {
                          api_name: 'subscription_webhook ideal payment',
                          payload: JSON.stringify(req.body),
                          error_message: error.message,
                          error_response: JSON.stringify(error)
                        };
        const logEntry = new LOGS(logs_data);
        await logEntry.save();
    }
}

const subscriptionCycle = async (invoice , event) => {

    try {

        // Extract relevant information
        const subscriptionId = invoice.subscription; // Subscription ID

        let subscriptionExist = await SUBSCRIPTION_MODEL.findOne({subscriptionId:subscriptionId});

        const subscriptionLine = await invoice.lines.data.find(line => line.type === 'subscription');
        // Convert UNIX timestamps to JavaScript Date objects
        const startPeriod = new Date(subscriptionLine.period.start * 1000); // Convert to milliseconds
        const endPeriod = new Date(subscriptionLine.period.end * 1000);

        let option = { new: true };
        
        // Set inactive to old entry related to this subscription ID because new Entry will start
        await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId:subscriptionId} , {active: CONSTANT.SUBSCRIPTION_STATUS.INACTIVE} ,option);

        let updateData  =   {
                                subscriptionId:invoice.subscription,
                                planId: subscriptionExist.planId,
                                productPriceId: subscriptionExist.priceId,
                                customerId: subscriptionExist.customerId,
                                role: subscriptionExist.role,
                                purchaseBy: subscriptionExist.purchaseBy,
                                purchaseByCompanyId: subscriptionExist?.purchaseByCompanyId,
                                purchaseByDriverId: subscriptionExist?.purchaseByDriverId,
                                amount: subscriptionExist.amount,
                                billing_reason: CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CYCLE,
                                startPeriod: startPeriod,
                                endPeriod: endPeriod,
                                chargeId: invoice.charge,
                                paymentIntentId: invoice.payment_intent,
                                invoiceId: invoice.id,
                                paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                                active: CONSTANT.SUBSCRIPTION_STATUS.ACTIVE,
                                invoicePdfUrl: invoice.invoice_pdf,
                                invoiceUrl: invoice.hosted_invoice_url,
                            };

        const subscriptionRenewal = new SUBSCRIPTION_MODEL(updateData);
        subscriptionRenewal.save();

        // update driver profile cache
        if (subscriptionExist?.role === CONSTANT.ROLES.DRIVER) {
            const driverId = subscriptionExist?.purchaseByDriverId;
            updateDriverMapCache(driverId);
        }

        
        let logs_data = {
                        api_name: 'subscription_webhook',
                        payload: event.type,
                        error_message: `billing_reason - subscription_cycle`,
                        error_response: JSON.stringify(event)
                      };
        const logEntry = new LOGS(logs_data);
        logEntry.save();

    } catch (error) {

        console.log('❌❌❌❌❌❌❌❌❌Error subscription_ cycle erro:', error.message);
        console.log(" subscriptionCycle webhook:", error.message);
    }
}

const handleInvoicePaymentFailure = async (invoice , req) => {

    try {

        // Handle invoice payment failures similarly
        const errorCode = invoice.last_payment_error?.code;
        const subscriptionId = invoice.subscription; // Subscription ID
        let option = { new: true };
        let updatedData;
        switch (errorCode) {
            case 'card_declined':
                console.error('Invoice payment failed: Card was declined.');
                
                updatedData = {
                                active: CONSTANT.SUBSCRIPTION_STATUS.INACTIVE,
                                cancelReason: CONSTANT.SUBSCRIPTION_CANCEL_REASON.CARD_DECLINED
                            }
                await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                await sendPaymentFailEmail(subscriptionId , CONSTANT.SUBSCRIPTION_CANCEL_REASON.CARD_DECLINED)
                break;
            case 'insufficient_funds':
                console.error('Invoice payment failed: Insufficient funds in the account.');
                
                updatedData = {
                                active: CONSTANT.SUBSCRIPTION_STATUS.INACTIVE,
                                cancelReason: CONSTANT.SUBSCRIPTION_CANCEL_REASON.INSUFFUCIENT_FUNDS
                            }
                await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                await sendPaymentFailEmail(subscriptionId , CONSTANT.SUBSCRIPTION_CANCEL_REASON.INSUFFUCIENT_FUNDS)
                break;
            case 'expired_card':
                console.error('Invoice payment failed: The card has expired.');
                updatedData = {
                                active: CONSTANT.SUBSCRIPTION_STATUS.INACTIVE,
                                cancelReason: CONSTANT.SUBSCRIPTION_CANCEL_REASON.EXPIRED_CARD
                            }
                await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                await sendPaymentFailEmail(subscriptionId , CONSTANT.SUBSCRIPTION_CANCEL_REASON.EXPIRED_CARD)
                break;
            case 'card_blocked':
                console.error('Invoice payment failed: The card is blocked.');
                updatedData = {
                                active: CONSTANT.SUBSCRIPTION_STATUS.INACTIVE,
                                cancelReason: CONSTANT.SUBSCRIPTION_CANCEL_REASON.CARD_BLOCKED
                            }
                await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                await sendPaymentFailEmail(subscriptionId , CONSTANT.SUBSCRIPTION_CANCEL_REASON.CARD_BLOCKED)
                break;
            case 'processing_error':
                console.error('Invoice payment failed: A technical error occurred while processing.');
                updatedData = {
                            active: CONSTANT.SUBSCRIPTION_STATUS.INACTIVE,
                            cancelReason: CONSTANT.SUBSCRIPTION_CANCEL_REASON.PROCESSING_ERROR
                        }
                await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                await sendPaymentFailEmail(subscriptionId , CONSTANT.SUBSCRIPTION_CANCEL_REASON.PROCESSING_ERROR)
                break;
            default:
                console.error('Invoice payment failed for an unknown reason.');

                updatedData = {
                                active: CONSTANT.SUBSCRIPTION_STATUS.INACTIVE,
                                cancelReason: CONSTANT.SUBSCRIPTION_CANCEL_REASON.UNKNOWN_ERROR
                            }
                await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                await sendPaymentFailEmail(subscriptionId , CONSTANT.SUBSCRIPTION_CANCEL_REASON.UNKNOWN_ERROR)
                break;
        }
    } catch (error) {

        console.log('❌❌❌❌❌❌❌❌❌Error subscription invoice payment failure erro:', error.message);
        
        let logs_data = {
                        api_name: 'subscription_webhook',
                        payload: JSON.stringify(req.body),
                        error_message: error.message,
                        error_response: JSON.stringify(error)
                        };
        const logEntry = new LOGS(logs_data);
        await logEntry.save();
    }
}