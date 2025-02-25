const { default: mongoose } = require("mongoose");
const { initiateStripePayment, checkPaymentStatus,} = require("../../Service/Stripe");
const constant = require("../../config/constant");
const USER_MODEL = require("../../models/user/user_model");
const PLANS_MODEL = require("../../models/admin/plan_model");
const SUBSCRIPTION_MODEL = require("../../models/user/subscription_model");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getUserActivePaidPlans ,
        getUserCurrentActivePayedPlan , 
        getConnectedAccountDetails , 
        sendEmailMissingInfoStripeOnboaring ,
        createConnectedAccount , 
        attachBankAccount , 
        createCustomAccount , 
        stripeOnboardingAccountLink} = require("../../Service/helperFuntion");


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
       
        let plans = await PLANS_MODEL.find({status: true}).lean();  // Use lean to get plain objects

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
                                message: `The provided plan ID is invalid.`,
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

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['ideal' , 'sepa_debit'],
            mode: 'subscription',  //isSubscription ? "subscription" : "payment",
            success_url: `${process.env.FRONTEND_URL}/subscription-payment-success?session_id={CHECKOUT_SESSION_ID}`, // Redirect after payment success
            cancel_url: `${process.env.FRONTEND_URL}/subscription-payment-fail`, // Redirect if the user cancels
            // customer_email: req.body.email, // Optional
            customer: customerId,
            line_items: [
                // {
                //     price_data: {
                //         currency: 'eur',
                //         product_data: {
                //             name: 'Subscription Initial Payment',
                //         },
                //         unit_amount: checkPlanExist.price * 100, // Amount in cents (e.g., 10€ = 1000)
                //     },
                //     quantity: 1,
                // },
                {
                    price: priceId, // Use Stripe's Price ID
                    quantity: 1,
                    tax_rates: [process.env.STRIPE_VAT_TAX_ID], // Optional: Add tax rate
                },
            ],
        });

        return res.json({ url: session.url });

    } catch (error) {

        console.error('Error createPaymentIntent error:', error.message);
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
                    const subscriptionId = activePlan.subscriptionId
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

            // Get invoice ID
            const invoiceId = createSubscription.latest_invoice.id;

            // Get payment intent ID
            const paymentIntentId = createSubscription.latest_invoice.payment_intent.id;

            // Get charge ID (if payment intent contains charges)
            const chargeId = createSubscription?.latest_invoice?.payment_intent?.charges?.data[0]?.id || null;
            
            return res.send({
                                code: constant.success_code,
                                subscriptionId: createSubscription.id,
                                clientSecret: createSubscription.latest_invoice.payment_intent.client_secret,
                                invoiceId: invoiceId,
                                paymentIntentId: paymentIntentId,
                                chargeId: chargeId,
                                createSubscription:createSubscription
                            });
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: `The provided plan ID is invalid.`,
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

            return res.send({
                                code: constant.success_code,
                                message:`Subscription has been cancelled successfully`
                            });
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: `Subscription not found.`,
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
                                message: `You don't have any paid plan`,
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
                                message: `User's account already attached`,
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
                    await sendEmailMissingInfoStripeOnboaring(userDetails?.connectedAccountId , connectedAccountDetails.requirements.currently_due)
                }
    
                return  res.send({
                                    code: constant.success_code,
                                    // charges_enabled:connectedAccountDetails?.charges_enabled,
                                    // payouts_enabled:connectedAccountDetails?.payouts_enabled,
                                    // capabilities_transfers:connectedAccountDetails?.capabilities?.transfers,
                                    // capabilities_card_payments:connectedAccountDetails?.capabilities?.card_payments,
                                    
                                    message: `Your bank account attached successfully with the platform`,
                                });
            } else {
                return  res.send({
                                    code: constant.error_code,
                                    message: `You bank account verification is still pending`,
                                });
            }

            
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: `User doesn't have platform stripe account`,
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