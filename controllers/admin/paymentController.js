const { initiateStripePayment, checkPaymentStatus } = require("../../Service/Stripe");
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
        // if(trip_by_id.is_paid){
        //   return res.send({
        //     code: constant.error_code,
        //     message:"Already paid"
        //    })
        // }
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

exports.failedTripPay = async (req, res) => {
    try {
        let tripId = req.params.id;
        const trip_by_id = await  TRIP.findById(tripId);
        if(!trip_by_id){
            return res.send({
                code: constant.error_code,
                message: "Unable to get the trip by id"
            })
        }
        // if(trip_by_id.is_paid){
        //   return res.send({
        //     code: constant.error_code,
        //     message:"Already paid"
        //    })
        // }
        trip_by_id.is_paid = false;
        trip_by_id.stripe_payment.payment_status = "Failed"
        await trip_by_id.save();
        res.send({
            result: trip_by_id,
            code: constant.success_code,
            message: "Payment failed"
        })
    } catch (err) {
        console.log("🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:", err)
        
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.successTripPay = async (req, res) => {
    try {
        let tripId = req.params.id;
        const trip_by_id = await  TRIP.findById(tripId);
        if(!trip_by_id){
            return res.send({
                code: constant.error_code,
                message: "Unable to get the trip by id"
            })
        }
        // if(trip_by_id.is_paid){
        //   return res.send({
        //     code: constant.error_code,
        //     message:"Already paid"
        //    })
        // }
        // check from strip side is payment completed
        // const resultFromStipe = await checkPaymentStatus(
        //     "cs_test_a1rcENK1oN8uuj8vr3CQDbQXv1wjqibuayZHb5PWQmatrW2mwnZg7kZFv0"
        //     // trip_by_id?.stripe_payment?.payment_intent_id
        //     );
        // if(resultFromStipe.success){
            trip_by_id.is_paid = true;
            trip_by_id.stripe_payment.payment_status = "Paid"
            await trip_by_id.save();
            res.send({
                result: trip_by_id,
                code: constant.success_code,
                message: "Payment Paid"
            })
        // }
        // else{
        //     trip_by_id.is_paid = false;
        //     trip_by_id.stripe_payment.payment_status = "Failed"
        //     await trip_by_id.save();
        //     res.send({
        //         result: trip_by_id,
        //         code: constant.error_code,
        //         message: "Payment Not Paid Yet"
        //     })
        // }
    } catch (err) {
        console.log("🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:", err)
        
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}
