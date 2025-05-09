const VEHICLE = require("../../models/user/vehicle_model");
const DRIVER = require("../../models/user/driver_model");
const USER = require("../../models/user/user_model");
const VEHICLETYPE = require("../../models/admin/vehicle_type");
const TRIP = require("../../models/user/trip_model");
const multer = require("multer");
const path = require("path");
const constant = require("../../config/constant");
const mongoose = require("mongoose");
const randToken = require("rand-token").generator();
const { sendNotification } = require("../../Service/helperFuntion");
const { isDriverHasCompanyAccess } = require("../../Service/helperFuntion");
const {partnerAccountRefreshTrip , noShowTrip , willCompanyPayCommissionOnTrip , dateFilter , sendBookingUpdateDateTimeEmail , sendTripUpdateToCustomerViaSMS} = require("../../Service/helperFuntion");
const AGENCY = require("../../models/user/agency_model");
const SETTING_MODEL = require("../../models/user/setting_model");

exports.add_trip = async (req, res) => {
  try {
    let data = req.body;
    data.created_by = req.userId;
    let token_code = randToken.generate(
      4,
      "1234567890abcdefghijklmnopqrstuvxyz"
    );
    data.trip_id = randToken.generate(4, "1234567890abcdefghijklmnopqrstuvxyz");
    let check_user = await USER.findOne({ _id: req.userId });
    let currentDate = moment().format("YYYY-MM-DD");
    let check_id = await TRIP.aggregate([
      {
        $match: {
          createdAt: {
            $gte: new Date(currentDate),
            $lt: new Date(
              new Date(currentDate).getTime() + 24 * 60 * 60 * 1000
            ), // Add 1 day to include the entire day
          },
        },
      },
    ]);
    let series = Number(check_id.length) + 1;
    data.series_id = token_code + "-" + "000" + series;
    data.trip_id = check_user.first_name + "-" + data.trip_id;

    let add_trip = await TRIP(data).save();
    if (!add_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to create the trip",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Saved Successfully",
        result: add_trip,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_trip = async (req, res) => {
  try {
    let data = req.body;

    let mid = new mongoose.Types.ObjectId(req.userId);
    let query;
    let search_value = data.comment ? data.comment : "";
    let dateQuery = await dateFilter(data );

    if (req.params.status == "Pending") {
      query = [
        { created_by: mid, status: true },
        {
          $or: [
            { trip_status: req.params.status },
            { trip_status: "Accepted" },
          ],
        },
        { is_deleted: false },
        {
          $or: [
            { comment: { $regex: search_value, $options: "i" } },
            { trip_id: { $regex: search_value, $options: "i" } },
            { "trip_from.address": { $regex: search_value, $options: "i" } },
            { "trip_to.address": { $regex: search_value, $options: "i" } },
          ],
        },
        dateQuery, // Add date filter query here
      ];
    } else {
      query = [
        { created_by: mid },
        { trip_status: req.params.status },
        {
          $or: [
            { comment: { $regex: search_value, $options: "i" } },
            { trip_id: { $regex: search_value, $options: "i" } },
            { "trip_from.address": { $regex: search_value, $options: "i" } },
            { "trip_to.address": { $regex: search_value, $options: "i" } },
          ],
        },
        dateQuery, // Add date filter query here
      ];
    }

    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: query,
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driver_name",
          foreignField: "_id",
          as: "driver",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicle",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          vehicle_type: 1,
          status: 1,
          commission: 1,
          comment: 1,
          pay_option: 1,
          is_deleted: 1,
          passenger_detail: 1,
          createdAt: 1,
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver.last_name", 0] },
            ],
          },
          driver_id: { $arrayElemAt: ["$driver._id", 0] },
          vehicle: {
            $concat: [
              { $arrayElemAt: ["$vehicle.vehicle_number", 0] },
              " ",
              { $arrayElemAt: ["$vehicle.vehicle_model", 0] },
            ],
          },
          trip_id: 1,
        },
      },
    ]).sort({ createdAt: -1 });
    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to get the trips",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
        result: get_trip,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_recent_trip = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.userId);

    let search_value = data.comment ? data.comment : "";

    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { created_by: mid },
            { is_deleted: false },
            { comment: { $regex: search_value, $options: "i" } },
          ],
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driver_name",
          foreignField: "_id",
          as: "driver",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicle",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          vehicle_type: 1,
          status: 1,
          commission: 1,
          comment: 1,
          pay_option: 1,
          is_deleted: 1,
          passenger_detail: 1,
          createdAt: 1,
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver.last_name", 0] },
            ],
          },
          vehicle: {
            $concat: [
              { $arrayElemAt: ["$vehicle.vehicle_number", 0] },
              " ",
              { $arrayElemAt: ["$vehicle.vehicle_model", 0] },
            ],
          },
          trip_id: 1,
        },
      },
    ]).sort({ createdAt: -1 });
    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to get the trips",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
        result: get_trip,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_counts_dashboard = async (req, res) => {
  try {
    let data = req.body;

    let mid = new mongoose.Types.ObjectId(req.userId);
    let getIds = await USER.find({ role: "HOTEL", created_by: req.userId });

    let search_value = data.comment ? data.comment : "";
    let ids = [];
    for (let i of getIds) {
      ids.push(i._id);
    }
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    let bookedTrip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
            { status: true },
            { trip_status: "Booked" },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let completedTrip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
            { status: true },
            { trip_status: "Completed" },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let pendingTrip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
            { status: true },
            { trip_status: "Pending" },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let cancelTrip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
            { status: true },
            { trip_status: "Canceled" },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let companyCount = await USER.find({ role: "COMPPANY" }).countDocuments();
    res.send({
      code: constant.success_code,
      message: "success",
      result: {
        bookedTrips: bookedTrip.length,
        cancelTrips: cancelTrip.length,
        pendingTrip: pendingTrip.length,
        completedTrip: completedTrip.length,
        companies: companyCount,
      },
    });
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.edit_trip = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let trip_data = await TRIP.findOne(criteria);

    let option = { new: true };
    data.status = true;

    if (data?.vehicle_type) { // when commission will be changed 

      if (data?.commission && data?.commission?.commission_value != 0) {
      
        let commission = data.commission.commission_value;
        if ( data.commission.commission_type === "Percentage" && data.commission.commission_value > 0 ) {
          commission = (Number(data.price) * data.commission.commission_value) / 100;
        }

        const companyDetails = await USER.findById(trip_data?.created_by_company_id);
        const isCommisionPay = await willCompanyPayCommissionOnTrip(req.user);


        if (!isCommisionPay?.paidPlan && !isCommisionPay?.specialPlan){

          return res.send({
                            code: constant.error_code,
                            result: `You can't create the trip because you didn't have any plan`,
                          });
        }

        const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});
        
        data.superAdminPaymentAmount = !isCommisionPay.commision  ? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0).toFixed(2);
        // data.superAdminPaymentAmount = (myPlans.length > 0 || companyDetails?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision?.value)) / 100 || 0);
        data.companyPaymentAmount = (commission - data.superAdminPaymentAmount).toFixed(2);
        data.driverPaymentAmount = (Number(data.price) - data.companyPaymentAmount - data.superAdminPaymentAmount).toFixed(2);
  
      } else {
        data.superAdminPaymentAmount = 0;
        data.companyPaymentAmount = 0;
        data.driverPaymentAmount = Number(data.price).toFixed(2)
      }
    }
    
   
    let update_trip = await TRIP.findOneAndUpdate(criteria, data, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to update the trip",
      });
    } else {

      // When Date and time will be updated then customer will be notify
      if (new Date(data.pickup_date_time).getTime() !== new Date(trip_data.pickup_date_time).getTime()) {
        
        sendBookingUpdateDateTimeEmail(update_trip); // update user regarding the date time changed
        const companyDetail = await USER.findById(data?.created_by_company_id);
        if (companyDetail?.settings?.sms_options?.trip_ceate_request) { // check if company turned on sms feature for update date time trip
          
          sendTripUpdateToCustomerViaSMS(update_trip , constant.SMS_EVENTS.CHANGE_PICKUP_DATE_TIME);
        }
      }

      // When driver will go to for pick the customer (On the way) then customer will be notify
      if (trip_data?.trip_status == constant.TRIP_STATUS.BOOKED && update_trip?.trip_status == constant.TRIP_STATUS.REACHED) {

        sendBookingUpdateDateTimeEmail(update_trip); // update user regarding the date time changed
        const companyDetail = await USER.findById(data?.created_by_company_id);
        if (companyDetail?.settings?.sms_options?.driver_on_the_way_request) { // check if company turned on sms feature for driver on the route
          
          sendTripUpdateToCustomerViaSMS(update_trip , constant.SMS_EVENTS.DRIVER_ON_THE_WAY);
        }
      }
        
      // when company send the trip to the driver for accepting and company want to cancel in between before accepying the driver
      if (data?.trip_status == constant.TRIP_STATUS.PENDING && trip_data?.trip_status == constant.TRIP_STATUS.APPROVED) {
        console.log('before accepting')
        let driver_data = await DRIVER.findOne({ _id: trip_data?.driver_name });
        req.io.to(driver_data.socketId).emit("popUpClose", { message: `Your trip request has been retrived by company`})
      }

      if ( data?.trip_status == constant.TRIP_STATUS.PENDING && trip_data.driver_name !== null && trip_data.driver_name != "null" && trip_data.driver_name != "" ) {

        let driver_data = await DRIVER.findOne({ _id: trip_data.driver_name });

        let device_token = driver_data?.deviceToken;
        if (device_token == "" || device_token == null) {

          let driver_data_created_by = await USER.findOne({ _id: driver_data.created_by,  });
          device_token = driver_data_created_by.deviceToken;
        }
      }

      if (update_trip?.trip_status == constant.TRIP_STATUS.ACTIVE || update_trip?.trip_status == constant.TRIP_STATUS.REACHED) {

        await DRIVER.findOneAndUpdate({_id: update_trip?.driver_name}, {status: true}, option);
      }

      

      // refresh trip functionality for the drivers who have account access as partner
      
      partnerAccountRefreshTrip(trip_data.created_by_company_id , "A trip has been changed.Please refresh the data", req.io);
      res.send({
        code: constant.success_code,
        message: "Updated successfully",
        result: update_trip,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.noShowUser = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let trip_data = await TRIP.findOne(criteria);

    let option = { new: true };
    data.status = true;
    
    let update_trip = await TRIP.findOneAndUpdate(criteria, data, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to update the trip",
      });
    } else {
      
      // If the driver does not find the customer at the trip's starting location, it will be classified as a "no-show" case.
      noShowTrip(trip_data.created_by_company_id , trip_data  , `The driver was unable to locate the customer at the specified location for Trip ID:- ${update_trip.trip_id}`, req.io);

      // Implement a "Refresh Trip" functionality for drivers with partner account access.
      
      partnerAccountRefreshTrip(trip_data.created_by_company_id , "The trip details have been updated. Please refresh the data to view the changes", req.io);
      return res.send({
                        code: constant.success_code,
                        message: "Updated successfully",
                        result: update_trip,
                      });
    }
  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.access_edit_trip = async (req, res) => {
  try {
    let data = req.body;

    if (req.user.role == "DRIVER") {

      let is_driver_has_company_access = await isDriverHasCompanyAccess(
                                                                          req.user,
                                                                          req.params.company_id
                                                                        );

      if (!is_driver_has_company_access) {

        return res.send({
                          code: constant.ACCESS_ERROR_CODE,
                          message: "The company's access has been revoked",
                        });
      }
    }

    let criteria = { _id: req.params.id };
    let trip_data = await TRIP.findOne(criteria);

    let option = { new: true };
    data.status = true;

    if (data?.commission && data?.commission?.commission_value != 0) {

      let commission = data.commission.commission_value;
      if ( data.commission.commission_type === "Percentage" && data.commission.commission_value > 0 ) {
        commission = (data.price * data.commission.commission_value) / 100;
      }

      const companyDetails = await USER.findById(trip_data?.created_by_company_id);
      if (!isCommisionPay?.paidPlan && !isCommisionPay?.specialPlan){

        return res.send({
                          code: constant.error_code,
                          result: `You can't create the trip because you didn't have any plan`,
                        });
      }
      const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});

      data.superAdminPaymentAmount = !isCommisionPay.commision  ? 0 : ((Number(commission) * parseFloat(adminCommision.value)) / 100 || 0).toFixed(2);
      // data.superAdminPaymentAmount = (myPlans.length > 0 || companyDetails?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0);
      data.companyPaymentAmount = (Number(commission) - Number(data.superAdminPaymentAmount)).toFixed(2);
      data.driverPaymentAmount = (Number(data.price) - data.companyPaymentAmount - data.superAdminPaymentAmount).toFixed(2);

    } else {
      data.superAdminPaymentAmount = 0;
      data.companyPaymentAmount = 0;
      data.driverPaymentAmount = Number(data.price).toFixed(2)
    }
    let update_trip = await TRIP.findOneAndUpdate(criteria, data, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to update the trip",
      });
    } else {

      // When Date and time will be updated then customer will be notify
      if (new Date(data.pickup_date_time).getTime() !== new Date(trip_data.pickup_date_time).getTime()) {
        
        sendBookingUpdateDateTimeEmail(update_trip); // update user regarding the date time changed
        const companyDetail = await USER.findById(data?.created_by_company_id);
        if (companyDetail?.settings?.sms_options?.trip_ceate_request) { // check if company turned on sms feature for update date time trip
          
          sendTripUpdateToCustomerViaSMS(update_trip , constant.SMS_EVENTS.CHANGE_PICKUP_DATE_TIME);
        }
      }

      // When driver will go to for pick the customer (On the way) then customer will be notify
      if (trip_data?.trip_status == constant.TRIP_STATUS.BOOKED && update_trip?.trip_status == constant.TRIP_STATUS.REACHED) {

        sendBookingUpdateDateTimeEmail(update_trip); // update user regarding the date time changed
        const companyDetail = await USER.findById(data?.created_by_company_id);
        if (companyDetail?.settings?.sms_options?.driver_on_the_way_request) { // check if company turned on sms feature for driver on the route
          
          sendTripUpdateToCustomerViaSMS(update_trip , constant.SMS_EVENTS.DRIVER_ON_THE_WAY);
        }
      }
      
      if ( data?.trip_status == "Pending" && trip_data.driver_name !== null && trip_data.driver_name != "null" && trip_data.driver_name != "" ) {
        let driver_data = await DRIVER.findOne({ _id: trip_data.driver_name });

        let device_token = driver_data?.deviceToken;
        if (device_token == "" || device_token == null) {

          let driver_data_created_by = await USER.findOne({ _id: driver_data.created_by, });
          device_token = driver_data_created_by.deviceToken;
        }

        //  device_token = "evnYTVy9QMm9Al231AlxEp:APA91bHG7ewABk-KVBrbXOG3LabwTe4NKdeuPIEa6VuWqnmUwirp8-aKgCfzI2ibPK5kxxVLS-qqE-hfQf-iVhqrhis5fKjurRdkzqLS4S6KEwZRkZ_ZnirAfEbLp-gGi8mSPHW7jvOY";

        try {
          const response = await sendNotification(
                                                    device_token,
                                                    `Trip has been retrived by company and trip ID is ${trip_data.trip_id}`,
                                                    `Trip has been retrived by company and trip ID is ${trip_data.trip_id}`,
                                                    trip_data
                                                  );
        } catch (e) {
          // res.send({
          //     code: constant.success_code,
          //     message: "not found",
          //     result: e
          // })
        }
      }

      partnerAccountRefreshTrip(update_trip.created_by_company_id , "A trip has been changed.Please refresh the data" , req.io);
      return res.send({
                  code: constant.success_code,
                  message: "Updated successfully",
                  result: update_trip,
                });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.delete_trip = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let option = { new: true };
    let newValue = {
      $set: {
        is_deleted: true,
      },
    };
    let update_trip = await TRIP.findOneAndUpdate(criteria, newValue, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to delete the trip",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Deleted Successfully",
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};
