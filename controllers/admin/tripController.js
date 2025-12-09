require("dotenv").config();
const i18n = require("i18n");
const AGENCY = require("../../models/user/agency_model");
const DRIVER = require("../../models/user/driver_model");
const USER = require("../../models/user/user_model");
const CAR_TYPE = require('../../models/admin/car_type_model')
const { getNextSequenceValue } = require("../../models/user/trip_counter_model");
var FARES = require("../../models/user/fare_model");
const TRIP = require("../../models/user/trip_model");
const PRICE_MODEL = require("../../models/user/price_model");
const TRIP_ASSIGNMENT_HISTORY = require("../../models/user/trip_assignment_history");
const SETTING_MODEL = require("../../models/user/setting_model");
const multer = require("multer");
const path = require("path");
const constant = require("../../config/constant");
const geolib = require("geolib");
const mongoose = require("mongoose");
const randToken = require("rand-token").generator();
const moment = require("moment");
const { sendNotification } = require("../../Service/helperFuntion");
const { 
        isDriverHasCompanyAccess , 
        getCompanyActivePaidPlans , 
        dateFilter , 
        canDriverOperate , 
        willCompanyPayCommissionOnTrip , 
        sendTripUpdateToCustomerViaSMS,
        sendBookingConfirmationEmail,
        getDistanceAndDuration,
        emitTripNotAcceptedByDriver,
        emitNewTripAddedByCustomer,
        emitTripAssignedToSelf,
      } = require("../../Service/helperFuntion");
const {partnerAccountRefreshTrip} = require("../../Service/helperFuntion");
const trip_model = require("../../models/user/trip_model");
const user_model = require("../../models/user/user_model");
const { default: axios } = require("axios");
const driver_model = require("../../models/user/driver_model");
const nodemailer = require("nodemailer");
const emailConstant = require("../../config/emailConstant");
const twilio = require("twilio");
const { Sms } = require("twilio/lib/twiml/VoiceResponse");
const similarity = require('string-similarity');

const tripIsBooked = async (tripId, driver_info, io) => {
  
  const driver_full_info = await driver_model.findOne({ _id: driver_info._id, });

  try {
    const tripById = await trip_model.findOne({
                                                _id: tripId,
                                                trip_status: constant.TRIP_STATUS.APPROVED,
                                              });

    if (tripById) {
      const updateDriver = await driver_model.findByIdAndUpdate( tripById.driver_name, { is_available: true } );
      tripById.driver_name = null;
      tripById.trip_status = constant.TRIP_STATUS.PENDING;
      await tripById.save();

      // for driver app side to close the pop-up------ this will apply for the app only
      if (driver_full_info?.socketId) {
        io.to(driver_full_info?.socketId).emit("popUpClose", {
                                                                trip: tripById,
                                                                message: "Close up socket connection",
                                                              });
      }

      emitTripNotAcceptedByDriver(io , tripById , updateDriver);
      
    }
  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌Error tripIsbooked:', err.message);
  }
};

exports.add_trip = async (req, res) => {
  try {
    let data = req.body;

    data.created_by = data.created_by ? data.created_by : req.userId;
    // data.trip_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
    data.trip_id    = await getNextSequenceValue();
    let token_code  = randToken.generate( 4, "1234567890abcdefghijklmnopqrstuvxyz" );
    // let check_user  = await USER.findOne({ _id: req.userId });
    
    data.series_id  = '';

    data.trip_id = "T" + "-" + data.trip_id;
   
    const origin = `${ data.trip_from.lat},${data.trip_from.log}`;
    const destination = `${data.trip_to.lat},${data.trip_to.log}`;
    let distanceInfo = await getDistanceAndDuration(origin , destination)
    data.trip_distance = distanceInfo?.distance?.text ? (parseFloat(distanceInfo?.distance?.text)  * 0.621371).toFixed(2) : ''; // in miles

    let  isCommisionPay;
    
    if (req.user.role == constant.ROLES.HOTEL) {
      const companyDetail = await USER.findById(data.created_by_company_id);

      if (!companyDetail) {
        return res.send({
                        code: constant.error_code,
                        result: res.__('addSubAdmin.error.invalidCompany')
                      });
      }
      isCommisionPay = await willCompanyPayCommissionOnTrip(companyDetail);
    } else {
      isCommisionPay = await willCompanyPayCommissionOnTrip(req.user);
    }
    
  
    
    if (!isCommisionPay?.paidPlan && !isCommisionPay?.specialPlan && req.user.role !== constant.ROLES.HOTEL){

      return res.send({
                        code: constant.error_code,
                        result: res.__('addTrip.error.noActivePlanForTripCreation')
                      });
    }
    

    if (data?.commission && data?.commission?.commission_value != 0) {
      
      let commission = data.commission.commission_value;
      if ( data.commission.commission_type === constant.TRIP_COMMISSION_TYPE.PERCENTAGE && data.commission.commission_value > 0 ) {
        commission = (data.price * data.commission.commission_value) / 100;
      }

      const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});

      // const myPlans = await getUserActivePaidPlans(req.user);
      
      
      if (isCommisionPay?.paidPlan) {

        data.susbscriptionPlanName  = isCommisionPay?.subscriptionDetail?.planDetails?.name;
        data.susbscriptionId        = isCommisionPay?.subscriptionDetail?._id;
        data.susbscriptionPlanId  = isCommisionPay?.subscriptionDetail?.planDetails?._id;
      }
      
      
      data.superAdminPaymentAmount = !isCommisionPay.commision  ? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0).toFixed(2);
      // data.superAdminPaymentAmount = (myPlans.length > 0 || req.user?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0);
      data.companyPaymentAmount = (Number(commission) - Number(data.superAdminPaymentAmount)).toFixed(2);
      data.driverPaymentAmount = (Number(data.price) - data.companyPaymentAmount - data.superAdminPaymentAmount).toFixed(2);


    } else {
      data.companyPaymentAmount = 0;
      if(data.price){
          data.driverPaymentAmount = Number(data.price).toFixed(2)
      }   
      data.superAdminPaymentAmount = 0;
   
    }

    let add_trip = await TRIP(data).save();
    if (!add_trip) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addTrip.error.unableToCreateTrip'),
                      });
    } else {


      // refresh trip functionality for the drivers who have account access as partner

      partnerAccountRefreshTrip(data.created_by_company_id , res.__('addTrip.socket.tripCreatedRefresh'),  req.io);

      if (data?.created_by_company_id) {
        
        sendBookingConfirmationEmail(add_trip)
        const companyDetail = await user_model.findById(data?.created_by_company_id);
       
        if (companyDetail?.settings?.sms_options?.trip_ceate_request?.enabled) { // check if company turned on sms feature for creat trip
          
          sendTripUpdateToCustomerViaSMS(add_trip , constant.SMS_EVENTS.TRIP_CREATE);
        }
      }

      return res.send({
                        code: constant.success_code,
                        message: res.__('addTrip.success.tripAdded'),
                        result: add_trip,
                      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error addtrip:', err.message);
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.access_add_trip = async (req, res) => {
  try {
    if (req.user.role == constant.ROLES.DRIVER) {
      let is_driver_has_company_access = await isDriverHasCompanyAccess(
        req.user,
        req.body.created_by_company_id
      );

      if (!is_driver_has_company_access) {
        return res.send({
                          code: constant.ACCESS_ERROR_CODE,
                          message: res.__('addTrip.error.companyAccessRevoked'),
                        });
        
      }
    }

    let data = req.body;


    // when we want insert lot of data at one time to check the
    // for (let i = 0; i < 900; i++) {

      data.created_by = data.created_by ? data.created_by : req.userId;
      // data.trip_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
      data.trip_id = await getNextSequenceValue();
      let token_code = randToken.generate(4,"1234567890abcdefghijklmnopqrstuvxyz");
      let check_user = await USER.findOne({ _id: req.userId });
      
      
      data.series_id = '';

      data.trip_id = "T" + "-" + data.trip_id;
      // let distance = (geolib.getDistance(
      //                                     {
      //                                       latitude: data.trip_from.log,
      //                                       longitude: data.trip_from.lat,
      //                                     },
      //                                     {
      //                                       latitude: data.trip_to.log,
      //                                       longitude: data.trip_to.lat,
      //                                     }
      //                                   ) * 0.00062137
      //                 ).toFixed(2);


      const origin = `${ data.trip_from.lat},${data.trip_from.log}`;
      const destination = `${data.trip_to.lat},${data.trip_to.log}`;
      let distanceInfo = await getDistanceAndDuration(origin , destination)
      data.trip_distance = distanceInfo?.distance?.text ? (parseFloat(distanceInfo?.distance?.text)  * 0.621371).toFixed(2) : ''; // in miles

      if (data?.commission && data?.commission?.commission_value != 0) {
        
        let commission = data.commission.commission_value;
        if ( data.commission.commission_type === constant.TRIP_COMMISSION_TYPE.PERCENTAGE && data.commission.commission_value > 0 ) {
          commission = (Number(data.price) * data.commission.commission_value) / 100;
        }

        const getCompanyDetails = await USER.findById(req.body.created_by_company_id);
        const isCommisionPay = await willCompanyPayCommissionOnTrip(req.user);

        if (!isCommisionPay?.paidPlan && !isCommisionPay?.specialPlan){

          return res.send({
                            code: constant.error_code,
                            result: res.__('addTrip.error.noActivePlanForTripCreation'),
                          });
        }

        if (isCommisionPay?.paidPlan) {

          data.susbscriptionPlanName  = isCommisionPay?.subscriptionDetail?.planDetails?.name;
          data.susbscriptionId        = isCommisionPay?.subscriptionDetail?._id;
          data.susbscriptionPlanId  = isCommisionPay?.subscriptionDetail?.planDetails?._id;
        }

        const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});
        
        data.superAdminPaymentAmount = !isCommisionPay.commision  ? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0).toFixed(2);
        // data.superAdminPaymentAmount = (myPlans.length > 0 || getCompanyDetails?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0);
        data.companyPaymentAmount = (Number(commission) - Number(data.superAdminPaymentAmount)).toFixed(2);
        data.driverPaymentAmount = (Number(data.price) - data.companyPaymentAmount - data.superAdminPaymentAmount).toFixed(2);
      } else {
        data.superAdminPaymentAmount = 0;
        data.companyPaymentAmount = 0;
        data.driverPaymentAmount = Number(data.price).toFixed(2)
      }


      let add_trip = await TRIP(data).save();
    // }
    

    if (!add_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('addTrip.error.unableToCreateTrip'),
      });
    } else {

       // refresh trip functionality for the drivers who have account access as partner
      
       partnerAccountRefreshTrip(data.created_by_company_id , res.__('addTrip.socket.tripCreatedRefresh'), req.io);

       if (data?.created_by_company_id) {

        sendBookingConfirmationEmail(add_trip)
        const companyDetail = await user_model.findById(data?.created_by_company_id);

        if (companyDetail?.settings?.sms_options?.trip_ceate_request?.enabled) { // check if company turned on sms feature for creat trip
          sendTripUpdateToCustomerViaSMS(add_trip , constant.SMS_EVENTS.TRIP_CREATE);
        }
      }
      
      res.send({
        code: constant.success_code,
        message: res.__('addTrip.success.tripAdded'),
        result: add_trip,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error access add trip:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.add_trip_link = async (req, res) => {
  try {
    let data = req.body;
    data.created_by = data.created_by;
    data.trip_id = await getNextSequenceValue();

    const userCheck = await USER.findById(data.created_by_company_id);

    if (!userCheck) {
      return res.send({
        code: constant.error_code,
        message: res.__('addTrip.error.invalidOrNonexistentCompany')
      });

    }
    
    data.series_id = '';
    data.trip_id = "T" + "-" + data.trip_id;
    data.driverPaymentAmount = data?.price ? data.price : 0;
    data.companyPaymentAmount = 0; 
    data.superAdminPaymentAmount = 0;
    
    let return_ticket_data = {}
    let isRetrunBooking = data?.is_return_booking;
    if (data?.is_return_booking) {
      
      return_ticket_data = data.return_booking;
      return_ticket_data.trip_id = "T" + "-" + (await getNextSequenceValue());
    }

    delete data?.is_return_booking;
    delete data?.return_booking;

    let origin = `${ data.trip_from.lat},${data.trip_from.log}`;
    let destination = `${data.trip_to.lat},${data.trip_to.log}`;
    let distanceInfo = await getDistanceAndDuration(origin , destination);
    data.trip_distance = distanceInfo?.distance?.text ? (parseFloat(distanceInfo?.distance?.text)  * 0.621371).toFixed(2) : ''; // in miles

  //  res.send({
  //       code: constant.error_code,
  //       message: "Unable to create the trip",
  //       data
  //     });
    let add_trip = await TRIP(data).save();
     
    emitNewTripAddedByCustomer(add_trip , req.io);
    let add_return_trip = null;
    if (isRetrunBooking) {
       
      let origin = `${ return_ticket_data.trip_from.lat},${return_ticket_data.trip_from.log}`;
      let destination = `${return_ticket_data.trip_to.lat},${return_ticket_data.trip_to.log}`;
      let distanceInfo = await getDistanceAndDuration(origin , destination)
      return_ticket_data.trip_distance = distanceInfo?.distance?.text ? (parseFloat(distanceInfo?.distance?.text)  * 0.621371).toFixed(2) : ''; // in miles
       
      add_return_trip = await TRIP(return_ticket_data).save();
      
      // Email will be sent though this function internally
      emitNewTripAddedByCustomer(add_return_trip , req.io)
    }
    
    // refresh trip functionality for the drivers who have account access as partner

    // partnerAccountRefreshTrip(data.created_by_company_id , "A trip has been created.Please refresh the data",  req.io);
    
    if (data?.created_by_company_id) {
      const companyDetail = await user_model.findById(data?.created_by_company_id);
      // sendBookingConfirmationEmail(add_trip)
      // if (isRetrunBooking) {
      //   console.log('add_return_trip-------' , add_return_trip)
      //   sendBookingConfirmationEmail(add_return_trip)
      // }
      if (companyDetail?.settings?.sms_options?.trip_ceate_request?.enabled) { // check if company turned on sms feature for creat trip
        sendTripUpdateToCustomerViaSMS(add_trip , constant.SMS_EVENTS.TRIP_CREATE);

        if (isRetrunBooking) {
            sendTripUpdateToCustomerViaSMS(add_return_trip , constant.SMS_EVENTS.TRIP_CREATE);
        }
      }
    }
    
    if (!add_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('addTrip.error.unableToCreateTrip')
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addTrip.success.tripAdded'),
        result: add_trip,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error add trip link:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.edit_trip_link = async (req, res) => {
  try {
    let data = req.body; 
    const tripId = req.params.trip_id;

    const tripDetails = await TRIP.findById(tripId);

    if (!tripDetails) {
      return res.send({
                      code: constant.error_code,
                      message: res.__('driverCancelTripReason.error.invalidTrip'),
                    });
    }

    tripDetails.pickup_date_time = data.pickup_date_time;
    tripDetails.comment = data.comment;
    
   if (data.customerDetails) {
      tripDetails.customerDetails.flightNumber = data.customerDetails.flightNumber;
      tripDetails.customerDetails.phone = data.customerDetails.phone;
      tripDetails.customerDetails.countryCode = data.customerDetails.countryCode;
      tripDetails.customerDetails.name = data.customerDetails.name;
    }

    let update_trip = await tripDetails.save();
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('editTrip.error.unableToUpdateTrip'),
      });
    }

    return res.send({
                      code: constant.success_code,
                      message: res.__('editTrip.success.tripUpdated'),
                      result: update_trip
                    });
    
    
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error edit trip link:', err.message);
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
    let getIds = await USER.find({ role: "HOTEL", created_by: req.userId });
    let pay_option = data.pay_option ? JSON.parse(data.pay_option) : []
    let search_value = data.comment ? data.comment : "";

    // Pagination values
    let page = parseInt(data?.page) || 1;
    let limit = parseInt(data?.limit) || 10;
    let skip = (page - 1) * limit;

    let ids = [];
    for (let i of getIds) {
      ids.push(i._id);
    }
    let dateQuery = await dateFilter(data );

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    let matchConditions = {
      $and: [
        {
          $or: [{ created_by: { $in: objectIds } }, { created_by: mid }, { created_by_company_id: mid }],
        },
        {
          under_cancellation_review: false
        },
        { status: true },
        { trip_status: req.params.status },
        { is_deleted: false },
        ...(pay_option.length > 0
          ? [{
              $or: pay_option.map((option) => ({
                pay_option: { $regex: `^${option}$`, $options: "i" },
              })),
            }]
          : []),
        dateQuery,
      ],
    };

    // First: Get total count (without skip/limit)
    let totalTrips = await TRIP.aggregate([
      { $match: matchConditions },
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
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "userData",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
        },
      },
      {
        $project: {
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver.last_name", 0] },
            ],
          },
          trip_id: 1,
          comment: 1,
          trip_from: 1,
          trip_to: 1,
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
        },
      },
      {
        $match: {
          $or: [
            { comment: { $regex: search_value, $options: "i" } },
            { trip_id: { $regex: search_value, $options: "i" } },
            { driver_name: { $regex: search_value, $options: "i" } },
            { "trip_from.address": { $regex: search_value, $options: "i" } },
            { "trip_to.address": { $regex: search_value, $options: "i" } },
            { company_name: { $regex: search_value, $options: "i" } },
          ],
        },
      },
      { $count: "total" }
    ]);

    let total = totalTrips.length > 0 ? totalTrips[0].total : 0;

    let get_trip = await TRIP.aggregate([
      { $match: matchConditions },
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
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "userData",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          customerDetails: 1,
          price: 1,
          passengerCount: 1,
          is_paid:1,
          car_type:1,
          car_type_id:1,
          drop_time:1,
          trip_distance:1,
          company_trip_payout_status:1,
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
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
      {
        $match: {
          $or: [
            { comment: { $regex: search_value, $options: "i" } },
            { trip_id: { $regex: search_value, $options: "i" } },
            { driver_name: { $regex: search_value, $options: "i" } },
            { "trip_from.address": { $regex: search_value, $options: "i" } },
            { "trip_to.address": { $regex: search_value, $options: "i" } },
            { company_name: { $regex: search_value, $options: "i" } },
          ],
        },
      },
      { $sort: { createdAt: -1 } },  // sort by latest
      { $skip: skip },               // skip documents
      { $limit: limit },
    ])

    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('getTrip.error.noTripFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('getTrip.success.tripListRetrieved'),
        total: total,
        page: page,
        limit: limit,
        totalPages: Math.ceil(total / limit),
        result: get_trip,
        
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get trip:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.companyGetTrip = async (req, res) => {
  try {
    let data = req.body;
    let companyId = req.body.company_id;
    let companydata = await USER.findOne({ role: constant.ROLES.COMPANY, _id: companyId });

    if (!companyId || !companydata) {

      return res.send({
        code: constant.error_code,
        message: res.__("companyGetFares.error.invalidCompany"),
      });
    } 
      
    let mid = new mongoose.Types.ObjectId(companyId);
    let getIds = await USER.find({ role: constant.ROLES.HOTEL, created_by: companyId });

    let search_value = data.comment ? data.comment : "";
    let ids = [];
    for (let i of getIds) {
      ids.push(i._id);
    }

    let dateQuery = await dateFilter(data );

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    // Pagination variables
    const page = parseInt(data.page) || 1; // Current page, default is 1
    const limit = parseInt(data.limit) || 10; // Items per page, default is 10
    const skip = (page - 1) * limit;

    let aggregatePipeline = [
      {
        $match: {
          $and: [
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
            { status: true },
            { trip_status: req.params.status },
            { is_deleted: false },
            dateQuery,
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
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "userData",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          customerDetails: 1,
          price: 1,
          passengerCount: 1,
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
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
      {
        $match: {
          $or: [
            { comment: { $regex: search_value, $options: "i" } },
            { trip_id: { $regex: search_value, $options: "i" } },
            { driver_name: { $regex: search_value, $options: "i" } },
            { "trip_from.address": { $regex: search_value, $options: "i" } },
            { "trip_to.address": { $regex: search_value, $options: "i" } },
            { company_name: { $regex: search_value, $options: "i" } },
          ],
        },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }, { $addFields: { page } }],
          data: [{ $sort: { createdAt: -1 } },{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

    // let get_trip = await TRIP.aggregate([
    //   {
    //     $match: {
    //       $and: [
    //         {
    //           $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
    //         },
    //         { status: true },
    //         { trip_status: req.params.status },
    //         { is_deleted: false },
    //         dateQuery,
    //       ],
    //     },
    //   },
    //   {
    //     $lookup: {
    //       from: "drivers",
    //       localField: "driver_name",
    //       foreignField: "_id",
    //       as: "driver",
    //     },
    //   },
    //   {
    //     $lookup: {
    //       from: "vehicles",
    //       localField: "vehicle",
    //       foreignField: "_id",
    //       as: "vehicle",
    //     },
    //   },

    //   {
    //     $lookup: {
    //       from: "agencies",
    //       localField: "created_by_company_id",
    //       foreignField: "user_id",
    //       as: "userData",
    //     },
    //   },
    //   {
    //     $lookup: {
    //       from: "agencies",
    //       localField: "hotel_id",
    //       foreignField: "user_id",
    //       as: "hotelData",
    //     },
    //   },
    //   {
    //     $project: {
    //       _id: 1,
    //       trip_from: 1,
    //       trip_to: 1,
    //       pickup_date_time: 1,
    //       trip_status: 1,
    //       createdAt: 1,
    //       created_by: 1,
    //       status: 1,
    //       passenger_detail: 1,
    //       vehicle_type: 1,
    //       comment: 1,
    //       commission: 1,
    //       pay_option: 1,
    //       customerDetails: 1,
    //       price: 1,
    //       passengerCount: 1,
    //       hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
    //       company_name: { $arrayElemAt: ["$userData.company_name", 0] },
    //       driver_name: {
    //         $concat: [
    //           { $arrayElemAt: ["$driver.first_name", 0] },
    //           " ",
    //           { $arrayElemAt: ["$driver.last_name", 0] },
    //         ],
    //       },
    //       driver_id: { $arrayElemAt: ["$driver._id", 0] },
    //       vehicle: {
    //         $concat: [
    //           { $arrayElemAt: ["$vehicle.vehicle_number", 0] },
    //           " ",
    //           { $arrayElemAt: ["$vehicle.vehicle_model", 0] },
    //         ],
    //       },
    //       trip_id: 1,
    //     },
    //   },
    //   {
    //     $match: {
    //       $or: [
    //         { comment: { $regex: search_value, $options: "i" } },
    //         { trip_id: { $regex: search_value, $options: "i" } },
    //         { driver_name: { $regex: search_value, $options: "i" } },
    //         { "trip_from.address": { $regex: search_value, $options: "i" } },
    //         { "trip_to.address": { $regex: search_value, $options: "i" } },
    //         { company_name: { $regex: search_value, $options: "i" } },
    //       ],
    //     },
    //   },
    // ]).sort({ createdAt: -1 });

    let results = await TRIP.aggregate(aggregatePipeline);
    let metadata = results[0]?.metadata[0] || { total: 0, page };
    let totalPages = Math.ceil(metadata.total / limit);

    if (!results) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        dateQuery:dateQuery,
        result: results[0]?.data || [],
        metadata: {
          total: metadata.total,
          currentPage: metadata.page,
          totalPages,
        },
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error compnay get trip:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.driverGetTrip = async (req, res) => {
  try {
    let data = req.body;
    let driverId = req.body.driver_id;
    let driverdata = await DRIVER.findOne({ _id: driverId });

    if (!driverId || !driverdata) {

      return res.send({
        code: constant.error_code,
        message: res.__("getDrivers.error.noDriverFound"),
      });
    } 
   
      
    driverId = new mongoose.Types.ObjectId(driverId);
    

    let search_value = data.comment ? data.comment : "";
    
    let dateQuery = await dateFilter(data );

    // Pagination variables
    const page = parseInt(data.page) || 1; // Current page, default is 1
    const limit = parseInt(data.limit) || 10; // Items per page, default is 10
    const skip = (page - 1) * limit;

    let aggregatePipeline = [
      {
        $match: {
          $and: [
            { driver_name: driverId},
            { status: true },
            { trip_status: req.params.status },
            { is_deleted: false },
            dateQuery,
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
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "userData",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          customerDetails: 1,
          price: 1,
          passengerCount: 1,
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
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
      // {
      //   $match: {
      //     $or: [
      //       { comment: { $regex: search_value, $options: "i" } },
      //       { trip_id: { $regex: search_value, $options: "i" } },
      //       { driver_name: { $regex: search_value, $options: "i" } },
      //       { "trip_from.address": { $regex: search_value, $options: "i" } },
      //       { "trip_to.address": { $regex: search_value, $options: "i" } },
      //       { company_name: { $regex: search_value, $options: "i" } },
      //     ],
      //   },
      // },
      {
        $facet: {
          metadata: [{ $count: "total" }, { $addFields: { page } }],
          data: [{ $sort: { createdAt: -1 } },{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

    let results = await TRIP.aggregate(aggregatePipeline);
    let metadata = results[0]?.metadata[0] || { total: 0, page };
    let totalPages = Math.ceil(metadata.total / limit);

    if (!results) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        dateQuery:dateQuery,
        result: results[0]?.data || [],
        metadata: {
          total: metadata.total,
          currentPage: metadata.page,
          totalPages,
        },
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error driver get trip:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.HotelGetTrip = async (req, res) => {
  try {
    let data = req.body;
    let hotelId = req.body.hotel_id;
    let hotelData = await USER.findOne({ role: constant.ROLES.HOTEL, _id: hotelId });

    if (!hotelId || !hotelData) {

      return res.send({
        code: constant.error_code,
        message: res.__("addSubAdmin.error.invalidHotel"),
      });
    } 
      
    hotelId = new mongoose.Types.ObjectId(hotelId);
    

    let search_value = data.comment ? data.comment : "";
   
    let dateQuery = await dateFilter(data );


    // Pagination variables
    const page = parseInt(data.page) || 1; // Current page, default is 1
    const limit = parseInt(data.limit) || 10; // Items per page, default is 10
    const skip = (page - 1) * limit;
    
    let aggregatePipeline = [
      {
        $match: {
          $and: [
            { hotel_id: hotelId },
            { status: true },
            { trip_status: req.params.status },
            { is_deleted: false },
            dateQuery,
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
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "userData",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          customerDetails: 1,
          price: 1,
          passengerCount: 1,
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
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
      {
        $match: {
          $or: [
            { comment: { $regex: search_value, $options: "i" } },
            { trip_id: { $regex: search_value, $options: "i" } },
            { driver_name: { $regex: search_value, $options: "i" } },
            { "trip_from.address": { $regex: search_value, $options: "i" } },
            { "trip_to.address": { $regex: search_value, $options: "i" } },
            { company_name: { $regex: search_value, $options: "i" } },
          ],
        },
      },
      {
        $facet: {
          metadata: [{ $count: "total" }, { $addFields: { page } }],
          data: [{ $sort: { createdAt: -1 } },{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

   
    let results = await TRIP.aggregate(aggregatePipeline);
    let metadata = results[0]?.metadata[0] || { total: 0, page };
    let totalPages = Math.ceil(metadata.total / limit);

    if (!results) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        dateQuery:dateQuery,
        metadata: {
          total: metadata.total,
          currentPage: metadata.page,
          totalPages,
        },
        result: results[0]?.data || [],
        
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error hotel get trip:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_access_trip = async (req, res) => {
  try {
    if (req.user.role == constant.ROLES.DRIVER) {
      let is_driver_has_company_access = await isDriverHasCompanyAccess(
        req.user,
        req.body.company_id
      );

      if (!is_driver_has_company_access) {
        res.send({
          code: constant.ACCESS_ERROR_CODE,
          message: res.__("addTrip.error.companyAccessRevoked"),
        });

        return;
      }
    }

    let data = req.body;

    let check_company = USER.findById(req.body.company_id);

    if (!check_company && check_company?.is_deleted == true) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("companyGetFares.error.invalidCompany"),
                      });
    }
    
    const page = parseInt(data.page) || 1; // Default to page 1 if not provided
    const limit = parseInt(data.limit) || 10; // Default to 10 items per page if not provided
    
    let   criteria =  {
                        status: true,
                        trip_status: req.params.status,
                        is_deleted: false,
                        created_by_company_id: new mongoose.Types.ObjectId(req.body.company_id),
                      };

    const totalCount = await TRIP.countDocuments(criteria);

    let get_trip = await TRIP.aggregate([
      {
        $match: criteria,
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
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "userData",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          vehicle_type: 1,
          payment_method_price:1,
          child_seat_price:1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          customerDetails: 1,
          car_type:1,
          car_type_id:1,
          price: 1,
          passengerCount: 1,
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
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


      { $sort: { createdAt: -1 } },
      // Pagination: skip and limit
      {
        $skip: (page - 1) * limit, // Skip documents for previous pages
      },
      {
        $limit: limit, // Limit the number of documents returned
      },
    ]);

    const getActivePaidPlans = await getCompanyActivePaidPlans(req.body.company_id);
    let hasSpecialPlan = await USER.findOne({_id: req.body.company_id});
    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
        activePlans: getActivePaidPlans.length > 0 ? true  : false,
        hasSpecialPlan: hasSpecialPlan?.is_special_plan_active ? true: false
      });
    } else {
      
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        result: get_trip,
        totalCount: totalCount,
        activePlans: getActivePaidPlans.length > 0 ? true  : false,
        hasSpecialPlan: hasSpecialPlan?.is_special_plan_active ? true: false,
        
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get access trip:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_all_access_trip = async (req, res) => {
  try {
    
    let companyIds = await req.user.company_account_access.map(item => item.company_id);

    if (companyIds.length == 0) {
      return res.send({
                        code: constant.error_code,
                        message:res.__("getTrip.error.noDataFound"),
                        result : []
                      });
    }

    let filteredCompanyId = [];

    // remove the driver who doesn't have the active payed plan
    for (let value of companyIds) {
      const checkUserSpecialPlan = await USER.findOne({_id: value , is_special_plan_active: true});
      
      if (checkUserSpecialPlan?._id) {
        filteredCompanyId.push(value)
        continue;
      }

      let getActivePaidPlans = await getCompanyActivePaidPlans(value)
      
      if (getActivePaidPlans.length > 0) {
        filteredCompanyId.push(value)
      }
    }
    
    companyIds = filteredCompanyId;
    
  
    let data = req.body;
    const page = parseInt(data.page) || 1; // Default to page 1 if not provided
    const limit = parseInt(data.limit) || 10; // Default to 10 items per page if not provided

    let   criteria =  {
                        status: true,
                        trip_status: req.params.status,
                        under_cancellation_review: false, // trip is not under review
                        is_deleted: false,
                        created_by_company_id: { $in: companyIds.map(id => new mongoose.Types.ObjectId(id)) }
                      };
              
    const totalCount = await TRIP.countDocuments(criteria);

    let get_trip = await TRIP.aggregate([
      {
        $match: criteria,
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
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "userData",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          customerDetails: 1,
          payment_method_price:1,
          child_seat_price:1,
          price: 1,
          passengerCount: 1,
          created_by_company_id:1,
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
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
          car_type: 1
        },
      },
      // Pagination: skip and limit
      {
        $skip: (page - 1) * limit, // Skip documents for previous pages
      },
      {
        $limit: limit, // Limit the number of documents returned
      },
    ]).sort({ createdAt: -1 });
    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound")
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        totalCount: totalCount,
        result: get_trip
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get all access trip:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_trip_for_hotel = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.userId);
    let search_value = data.comment ? data.comment : "";
    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { created_by: mid },
            { trip_status: req.params.status },
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
          customerDetails: 1,
          passengerCount: 1,
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
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        result: get_trip,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get trip for hotel:', err.message);
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
    let getIds = await USER.find({ role: "HOTEL", created_by: req.userId });
    let ids = [];
    for (let i of getIds) {
      ids.push(i._id);
    }
    let search_value = data.comment ? data.comment : "";
    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
            { comment: { $regex: search_value, $options: "i" } },
            // { trip_status: req.params.status },
            { is_deleted: false },
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
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "userData",
          pipeline: [
            {
              $lookup: {
                from: "agencies",
                localField: "_id",
                foreignField: "user_id",
                as: "agency",
              },
            },
            {
              $project: {
                company_name: { $arrayElemAt: ["$agency.company_name", 0] },
              },
            },
          ],
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          customerDetails: 1,
          passengerCount: 1,
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
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
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        result: get_trip,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get recent trip:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_recent_trip_super = async (req, res) => {
  
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.userId);
    let search_value = data.comment ? data.comment : "";

    let page = parseInt(data.page) || 1; // Current page number, default to 1
    let limit = parseInt(data.limit) || 10; // Number of results per page, default to 10
    let skip = (page - 1) * limit;
    let pay_option = data.pay_option ? JSON.parse(data.pay_option) : [];
    let trip_status = data.trip_status || '';
    trip_status = trip_status == 'All' || trip_status == '' ? '' : trip_status; 
    
    let criteria = {
                    $and: [
                            {
                              $or: [
                                { comment: { $regex: search_value, $options: "i" } },
                                { "trip_to.address": { $regex: search_value, $options: "i" } },
                                { "trip_from.address": { $regex: search_value, $options: "i" } },
                                { company_name: { $regex: search_value, $options: "i" } },
                                { trip: { $regex: search_value, $options: "i" } },
                              ],
                            },
                            pay_option.length > 0 ? { 
                                                      $or: pay_option.map((option) => ({
                                                                                         pay_option: { $regex: `^${option}$`, $options: "i" },
                                                                                      })
                                                                          ), 
                                                    } : {},
                                                    
                            trip_status ? {trip_status: trip_status} : {}
                          ]
                }

          
    let get_trip = await TRIP.aggregate([
      {
        $match: {
          is_deleted: false,
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
        $lookup: {
          from: "users",
          localField: "created_by_company_id",
          foreignField: "_id",
          as: "userData",
          pipeline: [
            {
              $lookup: {
                from: "agencies",
                localField: "_id",
                foreignField: "user_id",
                as: "agency",
              },
            },
            {
              $project: {
                company_name: { $arrayElemAt: ["$agency.company_name", 0] },
              },
            },
          ],
        },
      },
      {
        $project: {
          _id: 1,
          trip_from: 1,
          trip_to: 1,
          pickup_date_time: 1,
          trip_status: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          customerDetails: 1,
          passengerCount: 1,
          hosted_invoice_url:1,
          payment_collcted:1,
          invoice_pdf:1,
          is_paid:1,
          company_trip_payout_status:1,
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
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
      {
        $match: criteria
      },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: limit },
          ],
        },
      },
    ]);

    let results = get_trip[0]?.data;

    if (!results) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        totalCount :  get_trip[0]?.metadata[0]?.total | 0,
        result: results,
        
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get recent trip super:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_trip_by_company = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.body.trip_id);
    let search_value = data.comment ? data.comment : "";
    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            // { created_by: mid },
            { trip_status: req.params.status },
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
          createdAt: 1,
          customerDetails: 1,
          passengerCount: 1,
          pickup_date_time: 1,
          trip_status: 1,
          passenger_detail: 1,
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
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripListRetrieved"),
        result: get_trip,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get trip by compnay:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.check_trip_request = async (req, res) => {
  // const uniqueNumber = await getNextSequenceValue();

  if (req.params.id !== null || req.params.id != "") {
    let beforeTwentySeconds = new Date(new Date().getTime() - ( process.env.TRIP_POP_UP_SHOW_TIME * 1000));
    // beforeTwentySeconds = "2024-09-16T07:46:28.408Z";
    let find_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            {
              driver_name: new mongoose.Types.ObjectId(req.params.id),
              trip_status: constant.TRIP_STATUS.APPROVED,
              send_request_date_time: { $gte: beforeTwentySeconds },
            },
          ],
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "company",
        },
      },
      {
        $addFields: {
          company: { $arrayElemAt: ["$company", 0] },
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotel",
        },
      },
      {
        $addFields: {
          hotel: { $arrayElemAt: ["$hotel", 0] },
        },
      },
    ]);

    if (find_trip.length > 0) {
      let current_date_time = new Date();

      for (let index in find_trip) {
        // find_trip[index] = find_trip[index].toObject();
        let send_request_date_time = find_trip[index].send_request_date_time;

        // Calculate the difference in milliseconds
        let differenceInMilliseconds =
          current_date_time - new Date(send_request_date_time);

        // Convert milliseconds to seconds
        let differenceInSeconds = differenceInMilliseconds / 1000;

        find_trip[index].left_minutes = Math.round(process.env.TRIP_POP_UP_SHOW_TIME - differenceInSeconds);

        // find_trip[index].user_company_name = find_trip[index].company.company_agency.company_name;
        find_trip[index].user_company_name = find_trip[index].company?.company_name;
        find_trip[index].user_hotel_name = find_trip[index].hotel?.company_name;
      }
      res.send({
        code: constant.success_code,
        // query:{'driver_name': req.params.id , 'trip_status' : 'Accepted' , beforeTwentySeconds: beforeTwentySeconds},
        // id: req.params.id,
        data: find_trip,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripRequestFound"),
      });
    }
  } else {
    res.send({
      code: constant.error_code,
      message: res.__("getDrivers.error.inValidDriver"),
    });
  }
};

exports.alocate_driver = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let check_trip = await TRIP.findOne(criteria);

    if (!check_trip) {

      return res.send({
                        code: constant.error_code,
                        message: res.__("getTrip.error.inValidTrip"),
                      });
    }

    let driver_full_info = await DRIVER.findOne({ _id: data.driver_name });

    if (!driver_full_info) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getDrivers.error.inValidDriver"),
                      });
      
    }

    if (driver_full_info?.is_blocked) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getDrivers.error.driverBlocked"),
                      });
    }


    if (data.status != constant.TRIP_STATUS.CANCELED) {

      // Here we are checking the driver is available or not based on some condition like vehicle , plans and blocked etc
      const driverStatus = await canDriverOperate(driver_full_info._id);
      if (driverStatus?.isPassed == false) {

        return res.send({
                          code: constant.error_code,
                          message: driverStatus.message ,
                        });
      }

      // when trip can't be  editable 
      if ( check_trip.trip_status != constant.TRIP_STATUS.PENDING) {

        const message =   check_trip.trip_status === constant.TRIP_STATUS.REACHED ? res.__('editTrip.error.cantAllocateBookedReason') :
                          check_trip.trip_status === constant.TRIP_STATUS.ACTIVE ? res.__('editTrip.error.cantAllocateBookedReason') :
                          check_trip.trip_status === constant.TRIP_STATUS.COMPLETED ? res.__('editTrip.error.cantAllocateBookedReason') :
                          check_trip.trip_status === constant.TRIP_STATUS.CANCELED ? res.__('editTrip.error.cantAllocateCanceledReason') :
                          check_trip.trip_status === constant.TRIP_STATUS.NO_SHOW ? res.__('editTrip.error.cantAllocateNoShowReason') :
                          check_trip.trip_status === constant.TRIP_STATUS.BOOKED ? res.__('editTrip.error.cantAllocateBookedReason') :
                          check_trip.trip_status === constant.TRIP_STATUS.APPROVED ? res.__('editTrip.error.cantAllocateApprovedReason') :
                          res.__('editTrip.error.unableToUpdateTrip');
        return res.send({
                          code: constant.error_code,
                          message : message
                        });
      }

      const totalValue = (check_trip?.superAdminPaymentAmount | 0) + (check_trip?.companyPaymentAmount | 0 );

      if (totalValue > (check_trip?.price | 0)) {

        return res.send({
                          code: constant.error_code,
                          message : res.__('editTrip.error.commissionValidationError')
                        });
      }

      

      let newValues = {
                        $set: {
                          driver_name: driver_full_info._id,
                          vehicle: driver_full_info.defaultVehicle,
                          trip_status: driver_full_info._id.toString() == req?.user?.driverId?.toString() ? constant.TRIP_STATUS.BOOKED : data.status,
                          cancellation_reason: ""
                        },
                      };
      
      let option = { new: true };

      let update_trip = await TRIP.findOneAndUpdate( criteria, newValues, option );

      if (!update_trip) {
        return res.send({
                          code: constant.error_code,
                          message: res.__("getDrivers.error.unableToAssignDriver"),
                        });
      } 

      // For self assigned trip
      if (update_trip?.trip_status == constant.TRIP_STATUS.BOOKED) {

        const isPartiallyAccess = false; // to check if main company owner or partner accessign this function
        emitTripAssignedToSelf(update_trip , req.companyPartnerAccess , driver_full_info , req.io , )
        return res.send({
                        code: constant.success_code,
                        message:  res.__("getDrivers.success.allocatedDriver"),
                        // data: { trip: update_trip, company: req.user },
                      }); 
      }
        

      // when user is not alocating the trip to self
      if ( driver_full_info._id.toString() != req?.user?.driverId?.toString() && data.status !== constant.TRIP_STATUS.BOOKED ) {

        let driver_c_data = await USER.findOne({ _id: driver_full_info.created_by });

        let token_value = driver_full_info.deviceToken == null ? driver_c_data.deviceToken :driver_full_info.deviceToken;
        let web_token_value = driver_full_info.webDeviceToken == null ? driver_c_data.webDeviceToken :driver_full_info.webDeviceToken;
        

        if (token_value) {

         
          let targetLocale = driver_full_info?.app_locale || process.env.DEFAULT_LANGUAGE;

          let message = i18n.__({ phrase: "getTrip.success.tripOfferMessage", locale: targetLocale }, {
                                  trip_id: update_trip.trip_id,
                                  TRIP_POP_UP_SHOW_TIME: process.env.TRIP_POP_UP_SHOW_TIME
                                });

                                
          let title =  i18n.__({ phrase: "getTrip.success.tripOfferTitle", locale: targetLocale });

          await sendNotification( 
                                  token_value,
                                  message,
                                  title,
                                  {notificationType: constant.NOTIFICATION_TYPE.ALLOCATE_TRIP}
                                );

        }

        if (web_token_value) {

          let targetLocale = driver_full_info?.web_locale || process.env.DEFAULT_LANGUAGE;

          let message = i18n.__({ phrase: "getTrip.success.tripOfferMessage", locale: targetLocale }, {
                                    trip_id: update_trip.trip_id,
                                    TRIP_POP_UP_SHOW_TIME: process.env.TRIP_POP_UP_SHOW_TIME
                                  });
          let title =  i18n.__({ phrase: "getTrip.success.tripOfferTitle", locale: targetLocale });

          await sendNotification(
                                  web_token_value,
                                  message,
                                  title,
                                  {notificationType: constant.NOTIFICATION_TYPE.ALLOCATE_TRIP}
                                );
        }
      }
        
      // to resolve the object error
      
      if (update_trip && typeof update_trip.toObject === "function") update_trip = update_trip.toObject();

      // to resolve the object error
      if (req.user && typeof req.user.toObject === "function") req.user = req.user.toObject();
      // req.user = req.user.toObject();

      req.user.user_company_name = "";
      req.user.user_company_phone = "";
      update_trip.user_company_name = "";
      update_trip.user_company_phone = "";

      let user_agancy_data = await AGENCY.findOne({ user_id: req.user._id, });

      let hotel_data;
      
      if (update_trip?.hotel_id) {
        hotel_data = await AGENCY.findOne({ user_id: update_trip?.hotel_id, });
      }
        

      // Company name and phone added
      if (user_agancy_data) {
        req.user.user_company_name = user_agancy_data.company_name;
        req.user.user_company_phone = user_agancy_data.phone;

        update_trip.user_company_name = user_agancy_data.company_name;
        update_trip.user_company_phone = user_agancy_data.phone;
        update_trip.user_hotel_name = update_trip?.hotel_id ? hotel_data.company_name : "";
      }

      req?.io?.to(driver_full_info.socketId)?.emit("newTrip", { trip: update_trip, company: req.user });
      
      let current_date_time = new Date();

      // Update request send time in Trip
      await TRIP.updateOne( { _id: req.params.id } , { $set: { send_request_date_time: current_date_time } } );

      // Trip will be back in old state (Pending) if driver will not accept the trip
      
      setTimeout(() => { tripIsBooked(update_trip._id, driver_full_info, req.io); }, process.env.TRIP_POP_UP_SHOW_TIME * 1000);
      
      return res.send({
                        code: constant.success_code,
                        message: res.__("getDrivers.success.allocatedDriver"),
                        // data: { trip: update_trip, company: req.user },
                      });
      
    } else {
      let newValues = {
                        $set: {
                          trip_status: data.status,
                        },
                      };

      let option = { new: true };

      let update_trip = await TRIP.findOneAndUpdate( criteria, newValues, option );

      if (!update_trip) {
        return res.send({
                          code: constant.error_code,
                          message: res.__("getDrivers.error.unableToAssignDriver")
                        });
      } else {
        return res.send({
                          code: constant.success_code,
                          message: res.__("getTrip.success.tripCancelled"),
                        });
      }
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌allocate driver erro;:', err.message);
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.access_alocate_driver = async (req, res) => {
  try {
    let data = req.body;

    if (req.user.role == constant.ROLES.DRIVER) {
      let is_driver_has_company_access = await isDriverHasCompanyAccess(
                                                                          req.user,
                                                                          req.body.company_id
                                                                        );

      if (!is_driver_has_company_access) {
        return res.send({
                          code: constant.ACCESS_ERROR_CODE,
                          message: res.__("updateAccountAccess.error.accessRevoked"),
                        });
      }
    } else {
      return res.send({
                          code: constant.ACCESS_ERROR_CODE,
                          message: res.__("updateAccountAccess.error.accessDenied"),
                        });
    }

    let criteria = { _id: req.params.id };
    let check_trip = await TRIP.findOne(criteria);

    if (!check_trip) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getTrip.error.tripNotFound"),
                      });
    }

    let driver_full_info = await DRIVER.findOne({ _id: data.driver_name });

    if (!driver_full_info) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getDrivers.error.noneAvailable")
                      });
      
    }

    if (driver_full_info?.is_blocked) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getDrivers.error.driverBlocked"),
                      });
    }

    if (data.status != constant.TRIP_STATUS.CANCELED) {

      const driverStatus = await canDriverOperate(driver_full_info._id);

      // check if driver completed all the check to get the trip
      if (driverStatus?.isPassed == false) {

        return res.send({
                          code: constant.error_code,
                          message: driverStatus.message ,
                        });
      }

      const totalValue = (check_trip?.superAdminPaymentAmount | 0) + (check_trip?.companyPaymentAmount | 0 );

      if (totalValue > (check_trip?.price | 0)) {

        return res.send({
                          code: constant.error_code,
                          message : res.__('editTrip.error.commissionValidationError')
                        });
      }

      let newValues = {
                        $set: {
                          driver_name: driver_full_info._id,
                          vehicle: driver_full_info.defaultVehicle,
                          trip_status: driver_full_info._id.toString() == req.userId.toString() ? constant.TRIP_STATUS.BOOKED : data.status,
                          cancellation_reason: ""
                        },
                      };

      let option = { new: true };

      let update_trip = await TRIP.findOneAndUpdate( criteria, newValues, option );

      if (!update_trip) {
        return res.send({
                          code: constant.error_code,
                          message: res.__("getDrivers.error.unableToAssignDriver"),
                        });
      }

      // For self assigned trip
      if (update_trip?.trip_status == constant.TRIP_STATUS.BOOKED) {

        const isPartiallyAccess = true; // to check if main company owner or partner not accessign this function
        emitTripAssignedToSelf(update_trip , false , driver_full_info , req.io , isPartiallyAccess);

        return res.send({
                        code: constant.success_code,
                        message: res.__("getDrivers.success.allocatedDriver"),
                        // data: { trip: update_trip, company: req.user },
                      }); 
      }

      // when user is not alocating the trip to self
      if ( driver_full_info._id.toString() != req.userId.toString() && data.status !== constant.TRIP_STATUS.BOOKED ) {

        let driver_c_data = await USER.findOne({ _id: driver_full_info.created_by});
        let token_value = driver_full_info.deviceToken == null ? driver_c_data.deviceToken :driver_full_info.deviceToken;
        let web_token_value = driver_full_info.webDeviceToken == null ? driver_c_data.webDeviceToken :driver_full_info.webDeviceToken;
        

        if (token_value) {

          let targetLocale = driver_full_info?.app_locale || process.env.DEFAULT_LANGUAGE;

          let message = i18n.__({ phrase: "getTrip.success.tripOfferMessage", locale: targetLocale }, {trip_id: update_trip.trip_id , TRIP_POP_UP_SHOW_TIME: process.env.TRIP_POP_UP_SHOW_TIME});
          let title =  i18n.__({ phrase: "getTrip.success.tripOfferTitle", locale: targetLocale });

          await sendNotification( token_value, 
                                  message,
                                  title,
                                {notificationType: constant.NOTIFICATION_TYPE.ALLOCATE_TRIP}
                              );
        }

        if (web_token_value) {

          let targetLocale = driver_full_info?.web_locale || process.env.DEFAULT_LANGUAGE;

          let message = i18n.__({ phrase: "getTrip.success.tripOfferMessage", locale: targetLocale }, {trip_id: update_trip.trip_id , TRIP_POP_UP_SHOW_TIME: process.env.TRIP_POP_UP_SHOW_TIME});
          let title =  i18n.__({ phrase: "getTrip.success.tripOfferTitle", locale: targetLocale });

          await sendNotification(
                                  web_token_value,
                                  message,
                                  title,
                                  {notificationType: constant.NOTIFICATION_TYPE.ALLOCATE_TRIP}
                                );
        }
        
      }
        
        
      update_trip = update_trip.toObject();

      let user = await user_model.findOne({ _id: req.body.company_id, is_deleted: false })
                                .populate("created_by")
                                .populate("driverId");

      user = user.toObject();
      user.user_company_name = "";
      user.user_company_phone = "";
      update_trip.user_company_name = "";
      update_trip.user_company_phone = "";

      let user_agancy_data = await AGENCY.findOne({ user_id: req.body.company_id,  });
      let hotel_data;
      
      if (update_trip?.hotel_id) {
        hotel_data = await AGENCY.findOne({ user_id: update_trip?.hotel_id, });
      }
      // Company name a nd phone added
      if (user_agancy_data) {
        user.user_company_name = user_agancy_data.company_name;
        user.user_company_phone = user_agancy_data.phone;

        update_trip.user_company_name = user_agancy_data.company_name;
        update_trip.user_company_phone = user_agancy_data.phone;
        update_trip.user_hotel_name = update_trip?.hotel_id ? hotel_data.company_name : "";
      }

      
      req?.io?.to(driver_full_info.socketId)?.emit("newTrip", { trip: update_trip, company: user });
      


      let current_date_time = new Date();

      // Update request send time in Trip
      await TRIP.updateOne(
                            { _id: req.params.id }, // Filter (find the document by _id)
                            { $set: { send_request_date_time: current_date_time } } // Update (set the new value)
                          );

      setTimeout(() => { tripIsBooked(update_trip._id, driver_full_info, req.io); }, process.env.TRIP_POP_UP_SHOW_TIME * 1000);

      return res.send({
                        code: constant.success_code,
                        message: res.__("getDrivers.success.allocatedDriver"),
                        // data: { trip: update_trip, company: req.user }
                      });
      
    } else {
      let newValues = {
                        $set: {
                          trip_status: data.status,
                        },
                      };

      let option = { new: true };

      let update_trip = await TRIP.findOneAndUpdate( criteria, newValues, option );

      if (!update_trip) {
        return res.send({
                          code: constant.error_code,
                          message: res.__("getDrivers.error.unableToAssignDriver"),
                        });

      } else {
        return res.send({
                          code: constant.success_code,
                          message: res.__("getTrip.success.tripCancelled"),
                        });
      }
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error access allocate driver:', err.message);
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.get_trip_detail = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.params.id);

    const tripExist = await TRIP.findOne({ _id: req.params.id });

    if (!tripExist) {
      return res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
      });
    }

    let getData = await TRIP.aggregate([
      {
        $match: {
          _id: mid,
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driver_name",
          foreignField: "_id",
          as: "driver_info",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicle",
          foreignField: "_id",
          as: "vehicle_info",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "hotel_info",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "created_by_company_id",
          foreignField: "_id",
          as: "company",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "created_by",
          foreignField: "user_id",
          as: "company_detail",
        },
      },
      {
        $project: {
          // phone: { $arrayElemAt: ["$hotel_info.phone", 0] },
          // email: { $arrayElemAt: ["$hotel_info.email", 0] },
          phone: { $arrayElemAt: ["$company.phone", 0] },
          email: { $arrayElemAt: ["$company.email", 0] },
          countryCode: { $arrayElemAt: ["$company.countryCode", 0] },
          vehicle: { $arrayElemAt: ["$vehicle_info.vehicle_model", 0] },
          driverInfo: { $arrayElemAt: ["$driver_info", 0] },
          hotelImage: { $arrayElemAt: ["$hotel_info.profile_image", 0] },
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver_info.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver_info.last_name", 0] },
            ],
          },
          hotel_location: {
            $arrayElemAt: ["$company_detail.hotel_location", 0],
          },
          payment_method_price:1,
          child_seat_price:1,
          vehicle_model: 1,
          commission: 1,
          price: 1,
          vehicle_type: 1,
          trip_from: 1,
          trip_to: 1,
          trip_id: 1,
          pickup_date_time: 1,
          passenger_detail: 1,
          payment_method_price:1,
          child_seat_price:1,
          created_by: 1,
          is_deleted: 1,
          status: 1,
          trip_status: 1,
          createdAt: 1,
          updatedAt: 1,
          car_type:1,
          car_type_id:1,
          pay_option: 1,
          customerDetails: 1,
          passengerCount: 1,
          is_paid: 1,
          comment: 1,
          hotel_id: 1
        },
      },
    ]);

    // let distance = (
    //   geolib.getDistance(
    //     {
    //       latitude: getData[0].trip_from.log,
    //       longitude: getData[0].trip_from.lat,
    //     },
    //     {
    //       latitude: getData[0].trip_to.log,
    //       longitude: getData[0].trip_to.lat,
    //     }
    //   ) * 0.00062137
    // ).toFixed(2);

    if (!getData[0]) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      let getUser = await AGENCY.findOne({ user_id: getData[0].created_by });
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripDataRetrieved"),
        result: getData[0],
        hotelName: getUser ? getUser.company_name : "N/A",
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get trip details:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.access_get_trip_detail = async (req, res) => {
  try {
    let data = req.body;

    if (req.user.role == constant.ROLES.DRIVER) {
      let is_driver_has_company_access = await isDriverHasCompanyAccess(
        req.user,
        req.params.company_id
      );

      if (!is_driver_has_company_access) {
        return res.send({
          code: constant.ACCESS_ERROR_CODE,
          message: res.__("updateAccountAccess.error.accessRevoked")
        });
      }
    }

    let mid = new mongoose.Types.ObjectId(req.params.id);

    let getData = await TRIP.aggregate([
      {
        $match: {
          _id: mid,
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driver_name",
          foreignField: "_id",
          as: "driver_info",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicle",
          foreignField: "_id",
          as: "vehicle_info",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "hotel_info",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "created_by",
          foreignField: "user_id",
          as: "company_detail",
        },
      },
      {
        $project: {
          phone: { $arrayElemAt: ["$hotel_info.phone", 0] },
          email: { $arrayElemAt: ["$hotel_info.email", 0] },
          vehicle: { $arrayElemAt: ["$vehicle_info.vehicle_model", 0] },
          driverInfo: { $arrayElemAt: ["$driver_info", 0] },
          hotelImage: { $arrayElemAt: ["$hotel_info.profile_image", 0] },
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver_info.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver_info.last_name", 0] },
            ],
          },
          hotel_location: {
            $arrayElemAt: ["$company_detail.hotel_location", 0],
          },
          vehicle_model: 1,
          commission: 1,
          price: 1,
          vehicle_type: 1,
          trip_from: 1,
          trip_to: 1,
          trip_id: 1,
          pickup_date_time: 1,
          passenger_detail: 1,
          created_by: 1,
          is_deleted: 1,
          car_type:1,
          car_type_id:1,
          status: 1,
          trip_status: 1,
          createdAt: 1,
          updatedAt: 1,
          pay_option: 1,
          customerDetails: 1,
          passengerCount: 1,
          is_paid: 1,
          comment: 1,
          payment_method_price:1
        },
      },
    ]);

    let distance = (
      geolib.getDistance(
        {
          latitude: getData[0].trip_from.log,
          longitude: getData[0].trip_from.lat,
        },
        {
          latitude: getData[0].trip_to.log,
          longitude: getData[0].trip_to.lat,
        }
      ) * 0.00062137
    ).toFixed(2);

   

    if (!getData[0]) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
      });
    } else {
      let getUser = await AGENCY.findOne({ user_id: getData[0].created_by });
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripDataRetrieved"),
        result: getData[0],
        hotelName: getUser ? getUser.company_name : "N/A",
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error access get trip details:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getDistanceAndTime = async (req, res) => {
  try {

    let data = req.body;
    console.log('getDistanceAndTime--' , data?.locationFrom , data?.locationTo)
    const element = await getDistanceAndDuration(data?.locationFrom, data?.locationTo);
    
    if (element.status === 'OK') {
      
      return res.send({
        code: constant.success_code,
        distanceText: element.distance.text,       // e.g., "25.4 km"
        distanceMeters: element.distance.value,    // e.g., 25400
        durationText: element.duration.text,       // e.g., "32 mins"
        durationSeconds: element.duration.value
      });
    } else {
      // throw new Error(`Google Maps API error: ${element.status}`);
      return res.send({
        code: constant.error_code,
        message: element.status,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get distance and time:', err.message);
    return res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.calculatePrice = async (req, res) => {
  try {

    let data = req.body;
    const origin = data?.locationFrom;
    const destination = data?.locationTo.toLowerCase();
    const car_type_id = data?.car_type_id;
    const number_of_person = data?.number_of_person;
    let companyId = null;
    let isHotel = false;
    if (req?.params?.companyId) { // for booking and driver account access
      companyId = req?.params?.companyId;

    } else if (req?.user) {

      if (req?.user?.role == constant.ROLES.COMPANY) {
        companyId = req?.user?._id;
      } else if (req?.user?.role == constant.ROLES.HOTEL) {
        companyId = req?.user?.created_by._id;
        isHotel = true;
      }
    }
    
    
    const fareDetail = await FARES.findOne({car_type_id: car_type_id , created_by: companyId});

    if (!fareDetail) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getFare.error.nofareAvailable"),
                        d: {car_type_id: car_type_id , created_by: companyId}
                      });
    }
    const vehicleType = fareDetail?.car_type.toLowerCase();
    
    const element = await getDistanceAndDuration(origin, destination);

    if(element.status === 'ZERO_RESULTS' || element.status === 'NOT_FOUND') {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getTrip.error.calculationFailed"),
                        element
                      });
    }

    let kilometers = element.distance.value / 1000;
    
    let searchQuery = { user_id: companyId  , vehicle_type: vehicleType , status: true}; //status: true means price is enabled
    
    if (isHotel) {
      searchQuery.visible_to_hotel = true;
    }

    // if (number_of_person <= 4) {
    //   searchQuery.number_of_person = { $lte: 4 };
    // } else if (number_of_person > 4 && number_of_person <= 8) {
    //   searchQuery.number_of_person = { $gt: 4, $lte: 8 };
    // }

    // get the uploaded price based on 
    // console.log('searchQuery---' , searchQuery)
    const alluploadedPriceList = await PRICE_MODEL.find(searchQuery);
    // console.log('alluploadedPriceList---' , alluploadedPriceList)
    // console.log('alluploadedPriceList---' , alluploadedPriceList)
    // console.log('origin---' , origin)
    // console.log('destination---' , destination)

    const cleanString = (str) => str.normalize('NFKC').replace(/\u202F/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const originLower = cleanString(origin);
    const destinationLower = cleanString(destination);
    
    let matchingRoutes = []
    let directMatch =  await alluploadedPriceList?.filter((route) => {
                                                                      const routeFrom = cleanString(route?.departure_place || '');
                                                                      const routeTo = cleanString(route?.arrival_place || '');
                                                                        
                                                                      return (
                                                                        (originLower.includes(routeFrom) && destinationLower.includes(routeTo)) ||
                                                                        (routeFrom.includes(originLower) && routeTo.includes(destinationLower))
                                                                      );
                                                                    });

    
    let reverseMatch =  await alluploadedPriceList?.filter((route) => {
                                                                      const routeFrom = cleanString(route?.departure_place || '');
                                                                      const routeTo = cleanString(route?.arrival_place || '');
                                                                        
                                                                      return (
                                                                        (originLower.includes(routeTo) && destinationLower.includes(routeFrom)) ||
                                                                        (routeTo.includes(originLower) && routeFrom.includes(destinationLower))
                                                                      );
                                                                    });

    matchingRoutes = [ ...directMatch  , ...reverseMatch];


    // If we didn't get the result with excat matching then we will use similer matching functionality
    if (matchingRoutes?.length == 0) {
      
      let bestMatch = await alluploadedPriceList.find(route => {
                                                        const dbFrom = cleanString(route.departure_place);
                                                        const dbTo = cleanString(route.arrival_place);

                                                        const scoreA = 
                                                          similarity.compareTwoStrings(originLower, dbFrom) > 0.8 &&
                                                          similarity.compareTwoStrings(destinationLower, dbTo) > 0.8;

                                                        const scoreB = 
                                                          similarity.compareTwoStrings(originLower, dbTo) > 0.8 &&
                                                          similarity.compareTwoStrings(destinationLower, dbFrom) > 0.8;

                                                        return scoreA || scoreB;
                                                      });
      
      if (bestMatch) {
        matchingRoutes.push(bestMatch)
      }
      
    }

    let finalPrice = 0;
    let priceGetBy = null;                               
    if (matchingRoutes?.length > 0) {
      finalPrice = matchingRoutes[0].amount;
      priceGetBy = `uploaded price`;
      
    } else {

      
      
      if (kilometers < 10) {
        finalPrice = kilometers * fareDetail?.vehicle_fare_per_km;
        priceGetBy = `price below 10`
      } else if (kilometers >= 10 && kilometers < 25) {
        finalPrice = (9 * fareDetail?.vehicle_fare_per_km) + ( ( kilometers - 9 )* fareDetail?.km_10_fare);
        priceGetBy = `price under 10 and 25`
      } else if (kilometers >= 25){
        finalPrice = (9 * fareDetail?.vehicle_fare_per_km) + (15 * fareDetail?.km_10_fare) + ((kilometers - 24 ) * fareDetail?.km_25_fare);
        priceGetBy = `price above 25`
      }

      
      // get total minutes for path
      const durationText = element?.duration?.text
      let totalMinutes = 0;

      // Extract hours
      const hoursMatch = durationText.match(/(\d+)\s*hour/);
      if (hoursMatch) {
          totalMinutes += parseInt(hoursMatch[1], 10) * 60;
      }

      // Extract minutes
      const minutesMatch = durationText.match(/(\d+)\s*min/);
      if (minutesMatch) {
          totalMinutes += parseInt(minutesMatch[1], 10);
      }

      // start price will include here
      finalPrice = finalPrice + (fareDetail?.start_fare || 0);
      finalPrice = finalPrice + (totalMinutes * fareDetail?.per_minute_fare || 0); // add price for per minute fare

      if (finalPrice < fareDetail?.minimum_fare) {
        finalPrice = fareDetail?.minimum_fare;
        priceGetBy = `minimum price`
      }
    }

    
    finalPrice = finalPrice < fareDetail?.minimum_fare ? fareDetail?.minimum_fare : finalPrice
    if (element.status === 'OK') {
      
      return res.send({
        code: constant.success_code,
        kilometers,
        finalPrice: finalPrice.toFixed(2),
        priceGetBy,
        distanceText: element.distance.text,       // e.g., "25.4 km"
        distanceMeters: element.distance.value,    // e.g., 25400
        durationText: element.duration.text,       // e.g., "32 mins"
        durationSeconds: element.duration.value,
        
        // matchingRoutes,
        // alluploadedPriceList,
        // distanceText: element.distance.text,       // e.g., "25.4 km"
        // distanceMeters: element.distance.value,    // e.g., 25400
        // durationText: element.duration.text,       // e.g., "32 mins"
        // durationSeconds: element.duration.value
      });
    } else {
      // throw new Error(`Google Maps API error: ${element.status}`);
      return res.send({
        code: constant.error_code,
        message: element.status,
      });
    }
  } catch (err) {


    console.log('❌❌❌❌❌❌❌❌❌Error calculate price:', err.message);
    return res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.get_counts_dashboard = async (req, res) => {
  try {
    let data = req.body;

    let mid = new mongoose.Types.ObjectId(req.userId);
    let getIds = await USER.find({ role: constant.ROLES.HOTEL, created_by: req.userId });

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
            { status: true },
            { trip_status: constant.TRIP_STATUS.BOOKED },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let completedTrip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { status: true },
            { trip_status: constant.TRIP_STATUS.COMPLETED },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let pendingTrip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { status: true },
            { trip_status: constant.TRIP_STATUS.PENDING },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let cancelTrip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { status: true },
            { trip_status: constant.TRIP_STATUS.CANCELED },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let companyCount = await USER.find({ role: constant.ROLES.COMPANY }).countDocuments();

    res.send({
      code: constant.success_code,
      message: res.__("getTrip.success.dashboardCountSuccess"),
      result: {
        bookedTrips: bookedTrip.length,
        cancelTrips: cancelTrip.length,
        pendingTrip: pendingTrip.length,
        completedTrip: completedTrip.length,
        companies: companyCount,
      },
    });
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get counts dahsboard:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.add_trip1 = async (req, res) => {
  try {
    let data = req.body;
    data.created_by = data.created_by;
    data.trip_id = randToken.generate(4, "1234567890abcdefghijklmnopqrstuvxyz");
    let token_code = randToken.generate(
      4,
      "1234567890abcdefghijklmnopqrstuvxyz"
    );
    // let check_user = await USER.findOne({ _id: req.userId })
    
   
    data.series_id = ``;

    data.trip_id = "T" + "-" + data.trip_id;

    let checkCompanyId = await AGENCY.findOne({ company_id: data.company_id });
    if (!checkCompanyId) {
      res.send({
        code: constant.error_code,
        message: res.__("companyGetFares.error.invalidCompany"),
      });
    }

    let distance = (
      geolib.getDistance(
        {
          latitude: data.trip_from.log,
          longitude: data.trip_from.lat,
        },
        {
          latitude: data.trip_to.log,
          longitude: data.trip_to.lat,
        }
      ) * 0.00062137
    ).toFixed(2);

    data.created_by = checkCompanyId._id;
    
    

    let add_trip = await TRIP(data).save();

    var transporter = nodemailer.createTransport(emailConstant.credentials);
    var mailOptions = {
      from: emailConstant.from_email,
      to: data.email,
      subject: "Welcome mail",
      html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
            <html xmlns="http://www.w3.org/1999/xhtml">
              <head>
                <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
                <meta content="width=device-width, initial-scale=1" name="viewport" />
                <title>PropTech Kenya Welcome Email</title>
                <!-- Designed by https://github.com/kaytcat -->
                <!-- Robot header image designed by Freepik.com -->
                <style type="text/css">
                  @import url(https://fonts.googleapis.com/css?family=Nunito);
            
                  /* Take care of image borders and formatting */
            
                  img {
                    max-width: 600px;
                    outline: none;
                    text-decoration: none;
                    -ms-interpolation-mode: bicubic;
                  }
                  html {
                    margin: 0;
                    padding: 0;
                  }
            
                  a {
                    text-decoration: none;
                    border: 0;
                    outline: none;
                    color: #bbbbbb;
                  }
            
                  a img {
                    border: none;
                  }
            
                  /* General styling */
            
                  td,
                  h1,
                  h2,
                  h3 {
                    font-family: Helvetica, Arial, sans-serif;
                    font-weight: 400;
                  }
            
                  td {
                    text-align: center;
                  }
            
                  body {
                    -webkit-font-smoothing: antialiased;
                    -webkit-text-size-adjust: none;
                    width: 100%;
                    height: 100%;
                    color: #666;
                    background: #fff;
                    font-size: 16px;
                    width: 100%;
                    padding: 0px;
                    margin: 0px;
                  }
            
                  table {
                    border-collapse: collapse !important;
                  }
            
                  .headline {
                    color: #444;
                    font-size: 36px;
                    padding-top: 10px;
                  }
            
                  .force-full-width {
                    width: 100% !important;
                  }
                </style>
                <style media="screen" type="text/css">
                  @media screen {
                    td,
                    h1,
                    h2,
                    h3 {
                      font-family: "Nunito", "Helvetica Neue", "Arial", "sans-serif" !important;
                    }
                  }
                </style>
                <style media="only screen and (max-width: 480px)" type="text/css">
                  /* Mobile styles */
                  @media only screen and (max-width: 480px) {
                    table[class="w320"] {
                      width: 320px !important;
                    }
                  }
                </style>
                <style type="text/css"></style>
              </head>
              <body
                class="body"
                style="padding: 0px; margin: 0; display: block; background: #fff"
              >
                <table
                  align="center"
                  cellpadding="0"
                  cellspacing="0"
                  height="100%"
                  width="600px"
                  style="
                    margin-top: 30px;
                    margin-bottom: 10px;
                    border-radius: 10px;
                    box-shadow: 0px 1px 4px 0px rgb(0 0 0 / 25%);
                    background: #ccc;
                  "
                >
                  <tbody>
                    <tr>
                      <td align="center" bgcolor="#fff" class="" valign="top" width="100%">
                        <center class="">
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            class="w320"
                            style="margin: 0 auto"
                            width="600"
                          >
                            <tbody>
                              <tr>
                                <td align="center" class="" valign="top">
                                  <table
                                    bgcolor="#fff"
                                    cellpadding="0"
                                    cellspacing="0"
                                    class=""
                                    style="margin: 0 auto; width: 100%; margin-top: 0px"
                                  >
                                    <tbody style="margin-top: 5px">
                                      <tr
                                        class=""
                                        style="border-bottom: 1px solid #cccccc38"
                                      >
                                        <td class="">
                                            <img style="width: 40%;" src="${process.env.BASEURL}/static/media/taxi-logo.561c5ba100d503dd91d6.png" />
                                        </td>
                                      </tr>
                                      <tr class="">
                                        <td class="headline">
                                          Greeting from iDispatch Mobility!
                                        </td>
                                      </tr>
                                      <tr>
                                        <td>
                                          <center class="">
                                            <table
                                              cellpadding="0"
                                              cellspacing="0"
                                              class=""
                                              style="margin: 0 auto"
                                              width="75%"
                                            >
                                              <tbody class="">
                                                <tr class="">
                                                  <td
                                                    class=""
                                                    style="color: #444; font-weight: 400"
                                                  >
                                                    <br />
                                                    <br /><br />
                                                    Greeting from iDispatch Mobility! Your booking
                                                    has been created<br />
                                                    <br />
                                                    by this email:
                                                    <br />
                                                    <span style="font-weight: bold"
                                                      >Email: &nbsp;</span
                                                    ><span
                                                      style="font-weight: lighter"
                                                      class=""
                                                      >${data.email}</span
                                                    >
                                                    <br />
                                                    <br /><br />
                                                    <br />
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </center>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td class="">
                                          <div class="">
                                            <a
                                              style="
                                                background-color: #ffcc54;
                                                border-radius: 4px;
                                                color: #fff;
                                                display: inline-block;
                                                font-family: Helvetica, Arial, sans-serif;
                                                font-size: 18px;
                                                font-weight: normal;
                                                line-height: 50px;
                                                text-align: center;
                                                text-decoration: none;
                                                width: 350px;
                                                -webkit-text-size-adjust: none;
                                              "
                                              href="${process.env.BASEURL}/login"
                                              >Visit Account to check</a
                                            >
                                          </div>
                                          <br />
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
            
                                  <table
                                    bgcolor="#fff"
                                    cellpadding="0"
                                    cellspacing="0"
                                    class="force-full-width"
                                    style="margin: 0 auto; margin-bottom: 5px"
                                  >
                                    <tbody>
                                      <tr>
                                        <td class="" style="color: #444">
                                          
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </center>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </body>
            </html>`,
    };
    await transporter.sendMail(mailOptions);

    if (checkCompanyId.isSMS) {
      const accountSid = process.env.accountSid;
      const authToken = process.env.authToken;
      const client = require("twilio")(accountSid, authToken);
      client.messages.create({
        to: data.phone,
        from: "+3197010204679",
        body: res.__("getTrip.success.tripBookingCreated"),
      });
    }

    if (!add_trip) {
      res.send({
        code: constant.error_code,
        message: res.__("addTrip.error.unableToCreateTrip"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("addTrip.success.tripAdded"),
        result: add_trip,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error add trip1:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.check_company_id = async (req, res) => {
  try {
    let checkCompanyId = await AGENCY.findOne({ company_id: req.params.company_id,});
    if (!checkCompanyId) {
      res.send({
        code: constant.error_code,
        message: res.__("companyGetFares.error.invalidCompany"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("addSubAdmin.success.infoRetrievedSuccess"),
        result: checkCompanyId,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error check comnay id:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

// exports.search_trip_room = async(req,res)=>{
//     try{
//         let data = req.body
//         let search_trip = await TRIP.aggregate([

//         ])
//     }catch(err){
//         res.send({
//             code:constant.error_code,
//             message:err.message
//         })
//     }
// }
