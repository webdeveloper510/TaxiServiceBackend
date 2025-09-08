require("dotenv").config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const TRIP_MODEL = require('../../models/user/trip_model');
const USER_MODEL = require('../../models/user/user_model');
const CONSTANT = require('../../config/constant');
const LOGS = require("../../models/user/logs_model");
const {  notifyPayoutFailure , notifyPayoutPaid} = require("../../Service/helperFuntion");
const { toConstantCase} = require('../../utils/money');

module.exports = async function payoutWebhook(req, res) {
console.log('webhook triggered payout_webhook----------------')
  const istTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });  
    try {
         
        const endpointSecret = process.env.STRIPE_PAYOUT_SECRET;
          
          const sig = req.headers['stripe-signature'];
          let event;
         
          try {
            event = await stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            console.log("payout webhook received successfully----" , event.type);
            
          } catch (err) {
            console.log(`payout_webhook Error: ${err.message}`);


            let logs_data = { 
                              api_name: 'payout_webhook', payload: JSON.stringify(req.body),
                              error_message: err.message, error_response: JSON.stringify(err)
                            };

            const logEntry = new LOGS(logs_data);
            logEntry.save();
            return res.status(200).send({ received: true , error_message: err.message , istTime:istTime});
          }

          // -------------------- Main Logic start
        
          console.log('payout_webhook event-------up' , event)

          const tripDetails = await TRIP_MODEL.findOne({ 'payout.id': event?.data?.object?.id });

          if (tripDetails) {


            const userDetails = await USER_MODEL.findOne({ _id: tripDetails?.created_by_company_id });
            if (event.type === 'payout.paid' ) {
              const payout = event.data.object;
              const isPaid = payout.status === 'paid';
              // Handle successful payout here
              // For example, update your database or notify the user
              
              const updateTrip = await TRIP_MODEL.findOneAndUpdate(
                                                              { 'payout.id': payout?.id }, // Find by tripId
                                                              { $set: { 
                                                                        company_trip_payout_completed_date: payout. status == 'paid'?? new Date().toISOString(), 
                                                                        'payout.status': CONSTANT.PAYOUT_TANSFER_STATUS[toConstantCase(payout.status)],
                                                                        'payout.completed_date': isPaid ? new Date() : null,     // set only when paid
                                                                        'payout.failure_code': payout.failure_code || null,
                                                                        'payout.failure_message': payout.failure_message || null,
                                                                        is_company_paid: true,
                                                                        company_trip_payout_status: CONSTANT.PAYOUT_TANSFER_STATUS[toConstantCase(payout.status)]
                                                                      } 
                                                              }, // Update fields
                                                              { new: true } // Return the updated document
                                                            );
              
              notifyPayoutPaid(userDetails , tripDetails , payout);
                                                          
            } else if (event.type === 'payout.failed') {
  
              const chek = await TRIP_MODEL.findOneAndUpdate(
                                                            { company_trip_payout_id: payout?.id }, // Find by tripId
                                                            { $set: { 
                                                                      company_trip_payout_status: CONSTANT.PAYOUT_TANSFER_STATUS.FAILED,
                                                                      company_trip_payout_failure_code: payout.failure_code ,
                                                                      company_trip_payout_failure_message: payout.failure_message,
                                                                    } 
                                                            }, // Update fields
                                                            { new: true } // Return the updated document
                                                          );

              notifyPayoutFailure(userDetails , tripDetails , payout);
              console.log('payout failed------')
            }
          } else {
            console.log('trip not found based on this payout-------up' , event)
            let logs_data = { api_name: 'payout_webhook', payload: JSON.stringify(req.body),
                              error_message: `trip not found based on this payout`, error_response: JSON.stringify(event)
                            };

            const logEntry = new LOGS(logs_data);
            logEntry.save();
            return res.status(200).send({ received: true , error_message: `payout_webhook event not found` , istTime:istTime});
          }

          
          let logs_data = { api_name: 'payout_webhook', payload: event.type, error_message: `payout_webhook`, error_response: JSON.stringify(event) };
          const logEntry = new LOGS(logs_data);
          return res.status(200).send({ received: true  , message: `payout_webhook received successfully`, istTime:istTime});
          logEntry.save();
        } catch (error) {
          console.error("Error in webhook handler payout_webhook():", error.message);
          let logs_data = {
                            api_name: 'payout_webhook error',
                            payload: JSON.stringify(req.body),
                            error_message: error.message,
                            error_response: JSON.stringify(error)
                          };
          const logEntry = new LOGS(logs_data);
          logEntry.save();
          return res.status(200).send({ received: true , error_message: error.message , istTime:istTime});
      }
};
