const { default: mongoose } = require("mongoose");
const { initiateStripePayment, checkPaymentStatus,} = require("../../Service/Stripe");
const constant = require("../../config/constant");
const USER_MODEL = require("../../models/user/user_model");
const SMS_RECHARGE_MODEL = require("../../models/user/sms_recharge_model");
const SMS_TRANSACTION_MODEL = require("../../models/user/sms_transaction_model");
const PLANS_MODEL = require("../../models/admin/plan_model");
const SUBSCRIPTION_MODEL = require("../../models/user/subscription_model");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getUserActivePaidPlans ,
        getUserCurrentActivePayedPlan , 
        getConnectedAccountDetails , 
        sendEmailMissingInfoStripeOnboarding ,
        createConnectedAccount , 
        sendEmailCancelledSubcription , 
        createCustomAccount , 
        stripeOnboardingAccountLink} = require("../../Service/helperFuntion");
const { updateDriverMapCache , broadcastDriverLocation} = require("../../Service/location.service")

exports.createTax = async (req, res) => {
    try{

        const taxRate = await stripe.taxRates.create({
            display_name: 'VAT',
            description: '21% VAT',
            percentage: 21,
            inclusive: false, // Set to false for additional charge
        });
    
        console.log('Created Tax Rate:', taxRate.id);
        

        return  res.send({
                            code: constant.success_code,
                            tax_id: taxRate.id,
                        });
    
    
    } catch (error) {

        console.error('Error fetching subscription products:', error.message);
        

        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
}
exports.getSubscriptionProductsFromStripe = async (req, res) => {
    try {

        const products = await stripe.products.list({
            active: true, // Only fetch active products
        });

        const productsWithPrices = await Promise.all(
            products.data.map(async (product) => {
                let priceDetails = null;
                if (product.default_price) {
                    // Retrieve price details using default_price ID
                    priceDetails = await stripe.prices.retrieve(product.default_price);
                }

                return {
                    ...product,
                    priceDetails: priceDetails,
                    price: priceDetails.unit_amount / 100, // Include detailed price information
                };
            })
        );

        console.log('Subscription Products:', products.data);

        if (productsWithPrices) {

            for(let product of productsWithPrices){

                let planData = {  
                                    name : product.name,
                                    planId: product.id,
                                    status: product.active,
                                    price: product.price,
                                    productPriceId:product.priceDetails.id,
                                    description: product.description,
                                    
                                }
                console.log('planData-----' , planData)
                let checkPlanExist = await PLANS_MODEL.findOne({planId: product.id});

                if (checkPlanExist) {

                    // Plan will be updated
                    
                    let option = { new: true };
                    await PLANS_MODEL.findOneAndUpdate({_id: checkPlanExist._id} , planData ,option);
                } else {
                    // New settings will be added
                    const newPlan = new PLANS_MODEL(planData);
                    await newPlan.save();
                }
            }
        }
        return  res.send({
            code: constant.success_code,
            message: productsWithPrices,
        });

    } catch (error) {

        console.error('Error fetching subscription products:', error.message);
        

        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
}

exports.getProducts = async (req, res) => {

    try{


        // const custom = await createCustomAccount();
        // const account_link = await stripeOnboardingAccountLink(custom.id);
        // const connectAccountId = await createConnectedAccount();
        // const externalAccountId = await attachBankAccount(connectAccountId , {accountHolderName: "vijay rana" , iban: 'NL91ABNA0417164300'});

        // console.log(connectAccountId , externalAccountId)
        // Plan will work for first month if user cancel the susbcription after payment and user can use this

        let activePayedPlan = [];
        let activePlan;


        if (req.user) {

            activePayedPlan = await getUserActivePaidPlans(req.user);
            activePlan = await getUserCurrentActivePayedPlan(req.user);
        }

       
        let plans = await PLANS_MODEL.find({status: true , forRoles: req?.user?.role}).lean();  // Use lean to get plain objects

        if (plans) {

            for(let value of plans) {
                value.userActivePlan = value?.planId == activePlan?.planId ? true : false; // hihlight the active plan in the list
            }
        }
        return  res.send({
                            // custom:custom,
                            // account_link: account_link,
                            code: constant.success_code,    
                            activePayedPlan: activePayedPlan.reverse(),
                            activePlan:activePlan,
                            access: req.user,
                            planList: plans.reverse(),
                        });
    } catch (error) {

        console.error('Error fetching subscription products:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
}


exports.updateProducts = async (req, res) => {

    try{
        let data = req.body;
        const id = req.params.id;
        const product = await PLANS_MODEL.findOneAndUpdate(
            { _id: id },            // Query to find the document by ID
            { features: data.features },   // Update data
            { new: true }           // Return the updated document
        );
        return  res.send({
            code: constant.success_code,
            product:product,
            message: data,
        });
    } catch (error) {

        console.error('Error fetching subscription products:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
    
}

exports.createPaymentIntent = async (req, res) => {

    try{
        
        let data = req.body;
        const productPriceId = req.body.priceId || 0;

        let checkPlanExist = await PLANS_MODEL.findOne({productPriceId: productPriceId});

        if (checkPlanExist) {
            const vatRate = 0.21; // 21%
            const amount = Math.round((checkPlanExist.price * 100));
            const customerId = req.user.stripeCustomerId;

            const paymentIntent = await stripe.paymentIntents.create({
                                                                        amount:amount, // Amount in the smallest currency unit (e.g., cents for USD)
                                                                        currency: 'eur',
                                                                        payment_method_types: ['ideal'],
                                                                        customer: customerId,
                                                                        // payment_method_types: ['card'], // Default to 'card'
                                                                    });
          
            return res.send({
                                code: constant.success_code,
                                clientSecret: paymentIntent.client_secret,
                            });
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: res.__('payment.error.invalidPlan'),
                            });
        }
        
    } catch (error) {

        console.error('Error createPaymentIntent error:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
    
}

exports.createSetupIntent = async (req, res) => {

    try {
        const customerId  = req.user.stripeCustomerId;
    
        const setupIntent = await stripe.setupIntents.create({
          customer: customerId,
        });
    
        
        return  res.send({
                            code: constant.success_code,
                            clientSecret: setupIntent.client_secret,
                        });
      } catch (error) {
        console.error('Error creating setup intent:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
      }
    
}

// IDEAL or SEPA subscription functionality
exports.createIdealCheckoutSession = async (req, res) => {

    try {

        const customerId  = req.user.stripeCustomerId;
        const priceId = req.body?.priceId || '';

        let checkPlanExist = await PLANS_MODEL.findOne({productPriceId: priceId});

        if (checkPlanExist) {

            if (req.user.role == constant.ROLES.COMPANY) {

                let activePlan = await getUserCurrentActivePayedPlan(req.user);

                
                //  If there will be any current subscription then it will be cancelled. and new susbcription will be add
                if (activePlan) {
                    const subscriptionId = activePlan.subscriptionId
                    const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);// cancllled the previous plan
            
                    let option = { new: true };
                    let updatedData =   {
                                            active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                                            cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.USER_CANCEL
                                        };

                    await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                }
            }

            const description = `Subscription to the "${checkPlanExist?.name} (€${checkPlanExist?.price})" Plan purchased by ${req.user?.email} (Role: ${req.user.role})`;
            const session = await stripe.checkout.sessions.create({
                                                                    payment_method_types: ['ideal' , 'sepa_debit'],
                                                                    mode: 'subscription',  //isSubscription ? "subscription" : "payment",
                                                                    success_url: `${process.env.FRONTEND_URL}/subscription-payment-success?session_id={CHECKOUT_SESSION_ID}`, // Redirect after payment success
                                                                    cancel_url: `${process.env.FRONTEND_URL}/subscription-payment-fail`, // Redirect if the user cancels
                                                                    // customer_email: req.body.email, // Optional
                                                                    customer: customerId,
                                                                    subscription_data: {
                                                                                            description: description
                                                                                        },
                                                                    line_items: [
                                                                                    {
                                                                                        price: priceId, // Use Stripe's Price ID
                                                                                        quantity: 1,
                                                                                        tax_rates: [process.env.STRIPE_VAT_TAX_ID], // Optional: Add tax rate
                                                                                    },
                                                                                ],
                                                                });
    
            return res.json({ 
                                code: constant.success_code,
                                url: session.url 
                            });
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: res.__('payment.error.invalidPlan'),
                            });
        }

        

    } catch (error) {

        console.error('Error createPaymentIntent error:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
}

exports.smsBuyCreateIdealCheckoutSession = async (req, res) => {

    try {

        const smsPrice  = req.body.smsPrice;
        const customerId  = req.user.stripeCustomerId;
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['ideal'],
            mode: 'payment',  //isSubscription ? "subscription" : "payment",
            success_url: `${process.env.FRONTEND_URL}/sms-payment-success/{CHECKOUT_SESSION_ID}`, // Redirect after payment success
            cancel_url: `${process.env.FRONTEND_URL}/sms-payment-fail`, // Redirect if the user cancels
            // customer_email: req.body.email, // Optional
            customer: customerId,
            line_items: [
                            {
                                price_data: {
                                                currency: 'eur', // or 'usd', etc.
                                                unit_amount: Number(smsPrice) * 100, // in cents: €2.00 = 200 cents
                                                product_data: {
                                                name: `SMS Top-up (${smsPrice} Credits)`,
                                                description: `Top-up credits for SMS feature (€ ${smsPrice})`
                                            },
                                },
                                quantity: 1,
                                tax_rates: [process.env.STRIPE_VAT_TAX_ID],
                            }
                        ],
            payment_intent_data: {
                                    description: `SMS Credit Top-Up (€${smsPrice}) purchased by ${req.user.email}`,   // 👈 goes to Payments tab
                                },
            invoice_creation: {
                enabled: true, // Enable invoice creation
                // invoice_data: {
                //                 description: `One-time SMS top-up (€${smsPrice})`
                //             },
            },
            
        });

        let rechargeData = {
            checkoutSessionId: session.id,
            user_id: req.userId,
            payment_method: "IDEAL",
            price: smsPrice * 100,
            status: constant.SMS_RECHARGE_STATUS.PENDING,
        }

        const smsRecharge = new SMS_RECHARGE_MODEL(rechargeData);
        await smsRecharge.save();

        return res.json({ 
            code: constant.success_code,
            url: session.url,
            // session
        });
    } catch (error) {

        console.error('Error smsBuyCreateIdealCheckoutSession error:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
}

exports.smsPaymentValidateSession = async (req, res) => {
    try{

        

        const checkoutSessionId = req.body.session_id;
        const smsRechargeDetail = await SMS_RECHARGE_MODEL.findOne({checkoutSessionId:checkoutSessionId});

        if(!smsRechargeDetail) {
            return res.json({ 
                code: constant.error_code,
                message: res.__('payment.error.invalidOrExpiredSession')
            });
        }

       
        if (smsRechargeDetail.status == constant.SMS_RECHARGE_STATUS.PAID) {
            return res.json({ 
                code: constant.success_code,
                // code: constant.error_code,
                // message: res.__('payment.error.sessionAlreadyPaid')
                message: res.__('payment.success.paymentProcessed'),
            });
        }

        let session;
        let invoice = null;
        let retries = 10;
        session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
        // Invoice takes time to generate after completion the payment so We are trying to get invoice untill it will be generated

        // for (let i = 0; i < retries; i++) {
        //     session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
        //     console.log('invoice try count----' , i)
        //     if (session.invoice) {
        //         invoice = await stripe.invoices.retrieve(session.invoice);
        //         break;
        //     }
        //     await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2 seconds
        // }

        // if (!invoice) {
        //     return res.json({
        //         code: constant.error_code,
        //         message: "Invoice is still being generated. Please try again shortly.",
        //     });
        // }


        // session = await stripe.checkout.sessions.retrieve(checkoutSessionId); // getting session details
        // invoice = await stripe.invoices.retrieve(session.invoice); // get invoice details  based on session
        
        if (session.payment_status == 'paid') {

            let option = { new: true };
            let updatedData =   {
                                    status: constant.SMS_RECHARGE_STATUS.PAID,
                                    // hosted_invoice_url:invoice.hosted_invoice_url,
                                    // invoice_pdf:invoice.invoice_pdf
                                };
            await SMS_RECHARGE_MODEL.findOneAndUpdate({checkoutSessionId :checkoutSessionId } , updatedData , option);

            let userDetails = await USER_MODEL.findById(smsRechargeDetail.user_id);
            
            userDetails.sms_balance = (userDetails?.sms_balance ? userDetails?.sms_balance : 0) + smsRechargeDetail.price;
            await USER_MODEL.findOneAndUpdate({_id: userDetails._id}, {$set: {sms_balance: userDetails.sms_balance}} , { new: true })

            // get inoice for sms payment
            setTimeout(() => { getSmsPaymentInvoice(checkoutSessionId); }, 20 * 1000); // 20 seconds after
            return res.json({ 
                                code: constant.success_code,
                                message: res.__('payment.success.paymentProcessed'),
                            });
        } else {
            
            return res.json({ 
                code: constant.error_code,
                message: res.__('payment.error.paymentFailed')
            });
        }
    } catch (error) {

        console.error('Error smsPaymentValidateSession error:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
}

const getSmsPaymentInvoice = async (checkoutSessionId) => {

    try {

        const smsRechargeDetail = await SMS_RECHARGE_MODEL.findOne({checkoutSessionId:checkoutSessionId});
        let session;
        let invoice = null;
        let retries = 10;

        // Invoice takes time to generate after completion the payment so We are trying to get invoice untill it will be generated

        for (let i = 0; i < retries; i++) {
            session = await stripe.checkout.sessions.retrieve(checkoutSessionId);
            console.log('invoice try count----' , i)
            if (session.invoice) {
                invoice = await stripe.invoices.retrieve(session.invoice);
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 2000)); // wait 2 seconds
        }

        if (!invoice) {
            console.log({
                code: constant.error_code,
                message: "Invoice is still being generated. Please try again shortly.",
            });
        }

        if (session.payment_status == 'paid') {

            let option = { new: true };
            let updatedData =   { 
                                    hosted_invoice_url:invoice.hosted_invoice_url,
                                    invoice_pdf:invoice.invoice_pdf
                                };

                                console.log('sms invoices---' , updatedData)
            await SMS_RECHARGE_MODEL.findOneAndUpdate({checkoutSessionId :checkoutSessionId } , updatedData , option);
        }
    } catch (error) {
        console.error('Error getSmsPaymentInvoice error:', error.message);
    }
    
}

exports.smsRecharges = async (req, res) => {


    try{

        const page = parseInt(req.query.page) || 1; // default to page 1
        const limit = parseInt(req.query.limit) || 10; // default to 10 items per page
        const skip = (page - 1) * limit;

        const date = req.query.date ? new Date(req.query.date) : null;

        let dateFilter = {};
        if (date) {
            const startOfDay = new Date(date.setUTCHours(0, 0, 0, 0));
            const endOfDay = new Date(date.setUTCHours(23, 59, 59, 999));
            dateFilter.created_at = { $gte: startOfDay, $lte: endOfDay };
        }

        const filter = {
            user_id: req.userId,
            status: { $ne: constant.SMS_RECHARGE_STATUS.PENDING },
            ...dateFilter
        };

        const smsRechargeList = await SMS_RECHARGE_MODEL.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 });

        const totalCount = await SMS_RECHARGE_MODEL.countDocuments(filter);
        if (smsRechargeList) {

            return  res.send({
                code: constant.success_code,
                smsBalance: req.user.sms_balance,
                smsRechargeList: smsRechargeList,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
            });
        } else {

            return  res.send({
                code: constant.error_code,
                message: res.__('payment.error.noTopupHistory'),
            });
        }

    } catch (error) {

        console.error('Error smsBuyCreateIdealCheckoutSession error:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
}

exports.smsTransactionList = async (req, res) => {
    try{

        const page = parseInt(req.query.page) || 1; // default to page 1
        const limit = parseInt(req.query.limit) || 10; // default to 10 items per page
        const skip = (page - 1) * limit;

        const date = req.query.date ? new Date(req.query.date) : null;

        let dateFilter = {};
        if (date) {
            const startOfDay = new Date(date.setUTCHours(0, 0, 0, 0));
            const endOfDay = new Date(date.setUTCHours(23, 59, 59, 999));
            dateFilter.sent_at = { $gte: startOfDay, $lte: endOfDay };
        }

        const filter = {
            user_id: req.userId,
            ...dateFilter
        };

        console.log('dateFilter--------' , dateFilter)
        const smsTransactionList = await SMS_TRANSACTION_MODEL.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 });

        const totalCount = await SMS_TRANSACTION_MODEL.countDocuments(filter);

        if (smsTransactionList) {

            return  res.send({
                code: constant.success_code,
                smsBalance: req.user.sms_balance,
                smsTransactionList: smsTransactionList,
                currentPage: page,
                totalPages: Math.ceil(totalCount / limit),
            });
        } else {

            return  res.send({
                code: constant.error_code,
                message: res.__('payment.error.noTopupHistory'),
            });
        }
    } catch (error) {

        console.error('Error smsTransactionList error:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
}

exports.createSubscription = async (req, res) => {

    try {
        
        const priceId = req.body?.priceId || '';
        const paymentMethodId = req.body?.paymentMethodId || '';
        const customerId  = req.user.stripeCustomerId;

        let checkPlanExist = await PLANS_MODEL.findOne({productPriceId: priceId});

        if (checkPlanExist) {

            if (req.user.role == constant.ROLES.COMPANY) {

                let activePlan = await getUserCurrentActivePayedPlan(req.user);

                //  If there will be any current subscription then it will be cancelled. and new susbcription will be add
                if (activePlan) {
                    const subscriptionId = activePlan.subscriptionId;
                    const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);// cancllled the previous plan
            
                    let option = { new: true };
                    let updatedData = {
                        active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                        cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.USER_CANCEL
                    }
                    await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                    
                }
            }

            await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId, } );
            
            // ✅ Set it as the default payment method for future payments
            await stripe.customers.update(customerId,  { invoice_settings: { default_payment_method: paymentMethodId } });
            
            const createSubscription = await stripe.subscriptions.create({
                                                                            customer: customerId,
                                                                            items: [{ 
                                                                                        price: priceId,
                                                                                        tax_rates: [process.env.STRIPE_VAT_TAX_ID]
                                                                                    }],
                                                                            default_payment_method: paymentMethodId, // Attach the saved payment method
                                                                            payment_behavior: 'default_incomplete',
                                                                            expand: ['latest_invoice.payment_intent'],
                                                                            // metadata:   {
                                                                            //                 description: `Subscription purchased for ${checkPlanExist?.name} Plan by ${req.user?.email} with ${req.user.role} role`
                                                                            //             },
                                                                        });
           
            // Convert UNIX timestamps to JavaScript Date objects
            const startPeriod = new Date(createSubscription.current_period_start * 1000); // Convert to milliseconds
            const endPeriod = new Date(createSubscription.current_period_end * 1000);
            let subscriptionData =  {
                                        subscriptionId: createSubscription.id,
                                        productPriceId: priceId,
                                        planId: checkPlanExist.planId,
                                        customerId: customerId,
                                        role: req.user.role,
                                        purchaseBy: req.user._id,
                                        amount: checkPlanExist.price,
                                        startPeriod: startPeriod,
                                        endPeriod: endPeriod,
                                        invoiceName:createSubscription.latest_invoice?.number
                                    }

            if (req.user.role == constant.ROLES.COMPANY) {
                subscriptionData.purchaseByCompanyId = new mongoose.Types.ObjectId(req.userId);
            }

            if (req.user.role == constant.ROLES.DRIVER) {
                subscriptionData.purchaseByDriverId = new mongoose.Types.ObjectId(req.userId);
            }

            const newSubscription = new SUBSCRIPTION_MODEL(subscriptionData);
            await newSubscription.save();

            // // Get invoice ID
            // const invoiceId = createSubscription.latest_invoice.id;

            // // Get payment intent ID
            const paymentIntentId = createSubscription.latest_invoice?.payment_intent?.id || null;

            // // Get charge ID (if payment intent contains charges)
            // const chargeId = createSubscription?.latest_invoice?.payment_intent?.charges?.data[0]?.id || null;

            if (paymentIntentId) {
                await stripe.paymentIntents.update(paymentIntentId, {
                    description: `Subscription to the "${checkPlanExist?.name} (€${checkPlanExist?.price})" Plan purchased by ${req.user?.email} (Role: ${req.user.role})`,
                    // metadata: {
                    // tripId,
                    // companyId,
                    // userRole: req.user?.role,
                    // },
                });
            }

            if (req.user.role === constant.ROLES.DRIVER) {
                
                // driver detail will update after buy the plan
                setTimeout(() => { 
                                            const driverId = req.user._id
                                            refreshDriverCacheAndNotify(req.io , driverId)
                                        }, 
                                        10 * 1000
                            ); // function will  hit after 10 seconds
            }
            
            
            return res.send({
                                code: constant.success_code,
                                // subscriptionId: createSubscription.id,
                                clientSecret: createSubscription.latest_invoice.payment_intent.client_secret,
                                // invoiceId: invoiceId,
                                // paymentIntentId: paymentIntentId,
                                // chargeId: chargeId,
                                // createSubscription:createSubscription
                            });
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: res.__('payment.error.invalidPlan'),
                            });
        }
      
      } catch (error) {
        console.error('Error creating subscription:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
      }
}


const refreshDriverCacheAndNotify = async (io , driverId) => {
    try {

        const driverDetails = await updateDriverMapCache(driverId);
        await broadcastDriverLocation(io , driverId , driverDetails)
    } catch (error) {
        console.error('Error updateDriverSusbcriptionRedis in subscription controller:', error.message);
        
      }
}

exports.cancelSubscription = async (req, res) => {

    try {

        
        const subscriptionId = req.body?.subscriptionId || '';
       
        let subscriptionPlan = await SUBSCRIPTION_MODEL.findOne({subscriptionId: subscriptionId});
        

        if (subscriptionPlan) {

            const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);
            
            let option = { new: true };
            let updatedData = {
                active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.USER_CANCEL
            }
            await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);

            sendEmailCancelledSubcription(subscriptionId);

            // driver detail will update after cancel the plan
            if (req.user.role === constant.ROLES.DRIVER) {

                const driverId = req.user._id
                refreshDriverCacheAndNotify(req.io , driverId)                                        
            }
            return res.send({
                                code: constant.success_code,
                                message: res.__('payment.success.subscriptionCancelled')
                            });
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: res.__('payment.error.subscriptionNotFound'),
                            });
        }
      
      } catch (error) {
        console.error('Error creating subscription:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
      }
}

exports.getMyPaidPlans = async (req, res) => {

    try {

        let activePayedPlan = await getUserActivePaidPlans(req.user);

        if (activePayedPlan.length > 0) {
            
            return res.send({
                                code: constant.success_code,
                                data:activePayedPlan
                            });
        } else {

            return  res.send({
                                code: constant.error_code,
                                message: res.__('payment.error.noActivePaidPlan'),
                            });
        }
    } catch (error) {
        console.error('Error creating subscription:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
      }
}

exports.userOnboardOnStripe = async (req, res) => {
    try {
        const user_id = req.params.id || null;
        let userDetails = await USER_MODEL.findOne({_id : user_id});

        if (!userDetails?.connectedAccountId) {

            // Create the connected account ID if user didn't have
            const connectedAccountId = await createCustomAccount(userDetails?.email);

            userDetails = await USER_MODEL.findByIdAndUpdate(
                                                                {_id : user_id}, // User ID
                                                                { connectedAccountId:connectedAccountId }, // Updated field
                                                                { new: true } // Returns the updated document
                                                            );
        }
        

        if (userDetails?.isAccountAttched) {

            return  res.send({
                                code: constant.error_code,
                                message: res.__('payment.error.accountAlreadyAttached'),
                            });
        } else {

            const onboardLink = await stripeOnboardingAccountLink(userDetails?.connectedAccountId , user_id);
            return  res.send({
                                code: constant.success_code,
                                link: onboardLink,
                            });
        }
            
        
    } catch (error) {
        console.error('Error creating subscription:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
      }
}

exports.getConnectedAccountDetails = async (req, res) => {

    try {
        const userId = req.params.id || null;
        let userCondition = {_id : userId}
        const userDetails = await USER_MODEL.findOne(userCondition);
        
        if (userDetails?.connectedAccountId) {

            const connectedAccountDetails = await getConnectedAccountDetails(userDetails?.connectedAccountId);

            // User account verified
            if (connectedAccountDetails?.charges_enabled &&  
                connectedAccountDetails?.payouts_enabled &&
                connectedAccountDetails?.capabilities?.transfers == `active` && 
                connectedAccountDetails?.capabilities?.card_payments == `active`
            ) {
                let updateData =    { isAccountAttched : constant.CONNECTED_ACCOUNT.ACCOUNT_ATTACHED_STATUS.ACCOUNT_ATTACHED}
                let option = { new: true };
                await USER_MODEL.findOneAndUpdate(userCondition , updateData ,option);

                if (connectedAccountDetails.requirements.currently_due.length > 0) {
                    // Sent email to user to complete the pending stripe  onboarding info
                    sendEmailMissingInfoStripeOnboarding(userDetails?.connectedAccountId , connectedAccountDetails.requirements.currently_due)
                }
    
                return  res.send({
                                    code: constant.success_code,
                                    // charges_enabled:connectedAccountDetails?.charges_enabled,
                                    // payouts_enabled:connectedAccountDetails?.payouts_enabled,
                                    // capabilities_transfers:connectedAccountDetails?.capabilities?.transfers,
                                    // capabilities_card_payments:connectedAccountDetails?.capabilities?.card_payments,
                                    
                                    message: res.__('payment.success.accountLinkSuccess'),
                                });
            } else {

                if (connectedAccountDetails.requirements.currently_due.length > 0) {
                    // Sent email to user to complete the pending stripe  onboarding info
                    sendEmailMissingInfoStripeOnboarding(userDetails?.connectedAccountId , connectedAccountDetails.requirements.currently_due)
                }
                return  res.send({
                                    code: constant.error_code,
                                    message: res.__('payment.error.bankAccountVerificationPending'),
                                });
            }

            
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: res.__('payment.error.accountNotConnected'),
                            });
        }
        

    } catch (error) {
        console.error('Error creating subscription:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
      }
}