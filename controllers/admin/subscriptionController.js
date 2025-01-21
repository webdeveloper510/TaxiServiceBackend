const { default: mongoose } = require("mongoose");
const {
  initiateStripePayment,
  checkPaymentStatus,
} = require("../../Service/Stripe");
const constant = require("../../config/constant");

const PLANS_MODEL = require("../../models/admin/plan_model");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

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

        let plans = await PLANS_MODEL.find({status: true});
        return  res.send({
            code: constant.success_code,
            message: plans,
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
            const amount = checkPlanExist.price * 100;
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

        console.error('Error fetching subscription products:', error.message);
        return  res.send({
                    code: constant.error_code,
                    message: error.message,
                });
    }
    
}