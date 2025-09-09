require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const TRIP_MODEL = require('../../models/user/trip_model');
const USER_MODEL = require('../../models/user/user_model');
const SUBSCRIPTION_MODEL = require("../../models/user/subscription_model");
const CONSTANT = require('../../config/constant');
const LOGS = require("../../models/user/logs_model");
const { sendPaymentFailEmail , sendEmailSubscribeSubcription } = require("../../Service/helperFuntion");
const { toConstantCase} = require('../../utils/money');

module.exports = async function payoutWebhook(req, res) {
     console.log('subscription webhook triggered----------------');
     const istTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }); 

     try {

        const endpointSecret = process.env.STRIPE_TEST_WEBHOOK_ENDPOINT_SECRET;
                  
        const sig = req.headers['stripe-signature'];
        let event;

        try {

            event = await stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
       
        } catch (err) {

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

        // -------------------- Main Logic start
        if (event.type === 'invoice.payment_succeeded') {
            let invoice = event.data.object;
            let updateData;

            if (invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CREATE) {

                await susbcriptionCreate(invoice , req , event)
            } else if (invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CYCLE) {
            
            } else if (invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.CHECKOUT || invoice.billing_reason === CONSTANT.INVOICE_BILLING_REASON.MANUAL) {

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

            handleInvoicePaymentFailure(invoice)
        }

        // Log the webhook event
        console.log("Webhook received successfully");
        return res.status(200).send({ received: true  , message: `Webhook received successfully for subscription webhook`, istTime:istTime});
    
     } catch (error) {
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
            // await idealPaymentSubscription(req , invoice , paymentMethod.type);
        } else {
            let updateData  =   {
                                    chargeId: invoice.charge,
                                    paymentIntentId: invoice.payment_intent,
                                    invoiceId: invoice.id,
                                    paid: constant.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                                    active: constant.SUBSCRIPTION_STATUS.ACTIVE,
                                    invoicePdfUrl: invoice.invoice_pdf,
                                    invoiceUrl: invoice.hosted_invoice_url,
                                    billing_reason:CONSTANT.INVOICE_BILLING_REASON.SUBSCRIPTION_CREATE
                                }
            const result = await SUBSCRIPTION_MODEL.updateOne(
                                                                    { _id: new mongoose.Types.ObjectId(subscriptionExist._id) }, // filter
                                                                    { $set: updateData } // update operation
                                                                );
            let logs_data = {
                                api_name: 'subscription_webhook',
                                payload: event.type,
                                error_message: `billing_reason - subscription_create`,
                                error_response: JSON.stringify(event)
                            };
            
            const logEntry = new LOGS(logs_data);
            logEntry.save();
        }
    } catch (error) {
        console.log(" subscription webhook:", error.message);
    }

}

const handleInvoicePaymentFailure = async (invoice) => {

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
        console.error("Error in webhook handler handleInvoicePaymentFailure():", error.message);
        let logs_data = {
                        api_name: 'subscription_webhook',
                        payload: JSON.stringify(req.body),
                        error_message: err.message,
                        error_response: JSON.stringify(err)
                        };
        const logEntry = new LOGS(logs_data);
        await logEntry.save();
    }
}