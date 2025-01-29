const { default: mongoose } = require("mongoose");
const {
  initiateStripePayment,
  checkPaymentStatus,
} = require("../../Service/Stripe");
const constant = require("../../config/constant");

const PLANS_MODEL = require("../../models/admin/plan_model");
const SUBSCRIPTION_MODEL = require("../../models/user/subscription_model");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getUserActivePaidPlans ,getUserCurrentActivePayedPlan } = require("../../Service/helperFuntion");


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

        // Plan will work for first month if user cancel the susbcription after payment and user can use this
        let activePayedPlan = await getUserActivePaidPlans(req.user);

        let activePlan = await getUserCurrentActivePayedPlan(req.user)
        let plans = await PLANS_MODEL.find({status: true}).lean();  // Use lean to get plain objects

        if (plans) {

            for(let value of plans) {
                value.userActivePlan = value?.planId == activePlan?.planId ? true : false; // hihlight the active plan in the list
            }
        }
        return  res.send({
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
        const planId = req.body.planId || 0;

        let checkPlanExist = await PLANS_MODEL.findOne({planId: planId});

        if (checkPlanExist) {
            const vatRate = 0.21; // 21%
            const amount = Math.round((checkPlanExist.price * 100) * ( 1 + vatRate));
            const currency = 'eur';

            const paymentIntent = await stripe.paymentIntents.create({
                                                                        amount, // Amount in the smallest currency unit (e.g., cents for USD)
                                                                        currency,
                                                                        payment_method_types: ['card'], // Default to 'card'
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

exports.createSubscription = async (req, res) => {

    try {
        
        const priceId = req.body?.priceId || '';
        const customerId  = req.user.stripeCustomerId;

        let checkPlanExist = await PLANS_MODEL.findOne({productPriceId: priceId});

        if (checkPlanExist) {

            if (req.user.role == constant.ROLES.COMPANY) {

                let activePlan = await getUserCurrentActivePayedPlan(req.user);

                
                //  If there will be any current subscription then it will be cancelled. and new susbcription will be add
                if (activePlan) {
                    const subscriptionId = activePlan.subscriptionId
                    const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);
            
                    let option = { new: true };
                    let updatedData = {
                        active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                        cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.USER_CANCEL
                    }
                    await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
                    
                }
            }
            
            const createSubscription = await stripe.subscriptions.create({
                                                                            customer: customerId,
                                                                            items: [{ 
                                                                                        price: priceId,
                                                                                        tax_rates: [process.env.STRIPE_VAT_TAX_ID]
                                                                                    }],
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
                                        endPeriod: endPeriod
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