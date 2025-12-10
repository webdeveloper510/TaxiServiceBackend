const constant = require("../../config/constant");
const DRIVER = require("../../models/user/driver_model"); // Import the Driver model
const AGENCY = require("../../models/user/agency_model");
const USER = require("../../models/user/user_model"); // Import the Driver model
const TRIP = require("../../models/user/trip_model"); // Import the Driver model
const RATING_MODEL = require("../../models/user/trip_rating_model"); // Import the Driver model
const mongoose = require("mongoose");
const CONSTANT = require('../../config/constant')
// const { getUserActivePaidPlans } = require("../../Service/helperFuntion");

exports.addTripRating = async (req, res) => {
  let api_start_time = new Date();

  try {
    const trip_id = req.params.trip_id;
    const { rating, comment } = req.body;
    const tripDetail = await TRIP.findById(trip_id).select("_id driver_name trip_status");
      
    if (!tripDetail) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("getTrip.error.inValidTrip"),
                      });
    }

  

    if (tripDetail.trip_status != CONSTANT.TRIP_STATUS.COMPLETED) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("rating.error.tripNotCompleted"),
                        status: tripDetail.trip_status
                      });
    }

    if (!tripDetail.driver_name) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("getDriverDetail.error.unableToFetchDriverDetails"),
                      });
    }

    if (!comment.trim()) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("rating.error.commentRequired"),
                      });
    }


    if (rating < 1 || rating > 5) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("rating.error.invalidRange"),
                      });
    }

    const ratingDetail = await RATING_MODEL.findOne({ trip_id: trip_id  , driver_id: tripDetail.driver_name })

    if (ratingDetail) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("rating.error.alreadySubmitted"),
                      });
    }
    await RATING_MODEL.create({
                                trip_id: trip_id,
                                driver_id: tripDetail.driver_name, 
                                rated_by_role: CONSTANT.ROLES.CUSTOMER,
                                rating: rating,
                                comment: comment
                            })
    return res.send({
                        code: constant.success_code,
                        message: res.__("rating.success.submitted"),
                        result: result,
                    });
   
    
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error add trip rating:', err.message);
    console.log("🚀 ~ exports.get_driver= ~ err:", err);

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};