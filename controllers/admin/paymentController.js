const { initiateStripePayment } = require("../../Service/Stripe");
const constant = require("../../config/constant");
const TRIP = require("../../models/user/trip_model");

exports.tripCommissionPayment = async (req, res) => {
    try {
        let tripId = req.params.id;
        const trip_by_id = await  TRIP.findById(tripId);
        if(!trip_by_id){
            return res.send({
                code: constant.error_code,
                message: "Unable to get the trip by id"
            })
        }
        if(trip_by_id.is_paid){
          return res.send({
            code: constant.error_code,
            message:"Already paid"
           })
        }
        try {
            // let commission = trip_by_id.commission.commission_value;
            // if( trip_by_id.commission.commission_type === "Percentage"){
            //     commission =( trip_by_id.amount *  trip_by_id.commission.commission_value)/100
            // }
            const paymentResult = await initiateStripePayment(trip_by_id,100);
            res.send({
                code: constant.success_code,
                result: paymentResult,
                trip_by_id,
                message: "Success fully payment is created",
                // commission
            })
        } catch (error) {
            console.log("🚀 ~ file: paymentController.js:34 ~ exports.tripCommissionPayment= ~ error:", error)
            res.send({
                code: constant.error_code,
                message: "Error while creating payment"
            })
        }
    } catch (err) {
        console.log("🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:", err)
        
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}