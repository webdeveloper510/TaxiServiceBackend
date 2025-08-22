const DRIVER = require("../../models/user/driver_model");
const USER = require("../../models/user/user_model");
const TRIP = require("../../models/user/trip_model");
const TRIP_CANCELLATION_REQUEST = require("../../models/user/trip_cancellation_requests_model");
const multer = require("multer");
const path = require("path");
const constant = require("../../config/constant");
const mongoose = require("mongoose");
const randToken = require("rand-token").generator();
const { sendNotification } = require("../../Service/helperFuntion");
const { isDriverHasCompanyAccess } = require("../../Service/helperFuntion");
const {
  partnerAccountRefreshTrip , 
  noShowTrip , 
  willCompanyPayCommissionOnTrip , 
  dateFilter , 
  sendBookingUpdateDateTimeEmail , 
  sendTripUpdateToCustomerViaSMS ,
  sendBookingCancelledEmail ,
  getDistanceAndDuration
} = require("../../Service/helperFuntion");
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
        message: res.__('addTrip.error.unableToCreateTrip'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addTrip.success.tripAdded'),
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

    if (req.params.status == constant.TRIP_STATUS.PENDING) {
      query = [
        { created_by: mid, status: true },
        {
          $or: [
            { trip_status: req.params.status },
            { trip_status: constant.TRIP_STATUS.APPROVED },
          ],
        },
        {
          under_cancellation_review: false
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
          under_cancellation_review: false
        },
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
          car_type:1,
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
          trip_distance:1,
        },
      },
    ]).sort({ createdAt: -1 });
    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('getTrip.error.unableToRetrieveTrip'), 
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('getTrip.success.tripDataRetrieved'),
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
        message: res.__('getTrip.error.unableToRetrieveTrip'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('getTrip.success.tripDataRetrieved'),
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
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
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
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
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
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
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
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
            { status: true },
            { trip_status: constant.TRIP_STATUS.CANCELED },
            { is_deleted: false },
          ],
        },
      },
    ]);
    let companyCount = await USER.find({ role: constant.ROLES.COMPANY }).countDocuments();
    return res.send({
                      code: constant.success_code,
                      message: res.__('getTrip.success.dashboardCountsRetrieved'),
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

exports.update_trip = async (req , res) => {
  try {

    let data = req.body;
    let criteria = { _id: req.params.id };
    let trip_data = await TRIP.findOne(criteria);
    let option = { new: true };
    data.status = true;

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
                        result: res.__('editTrip.error.noActivePlanForTripCreation'),
                      });
    }

    // when trip can't be  editable 
    if ( [constant.TRIP_STATUS.REACHED , constant.TRIP_STATUS.ACTIVE , constant.TRIP_STATUS.COMPLETED , constant.TRIP_STATUS.CANCELED , constant.TRIP_STATUS.NO_SHOW].includes(trip_data.trip_status)) {

      const message =   trip_data.trip_status === constant.TRIP_STATUS.REACHED ? res.__('editTrip.error.cantEditReachedReason') :
                        trip_data.trip_status === constant.TRIP_STATUS.ACTIVE ? res.__('editTrip.error.cantEditActiveReason') :
                        trip_data.trip_status === constant.TRIP_STATUS.COMPLETED ? res.__('editTrip.error.cantEditCompletedReason') :
                        trip_data.trip_status === constant.TRIP_STATUS.CANCELED ? res.__('editTrip.error.cantEditCanceledReason') :
                        trip_data.trip_status === constant.TRIP_STATUS.NO_SHOW ? res.__('editTrip.error.cantEditNoShowReason') :
                        res.__('editTrip.error.unableToUpdateTrip');
      return res.send({
                        code: constant.error_code,
                        message : message
                      });
    }

    if (data?.commission && data?.commission?.commission_value != 0) {
      let commission = data.commission.commission_value;
      if ( data.commission.commission_type === constant.TRIP_COMMISSION_TYPE.PERCENTAGE && data.commission.commission_value > 0 ) {
        commission = (Number(data.price) * data.commission.commission_value) / 100;
      }

      const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});
        
      data.superAdminPaymentAmount = !isCommisionPay.commision  ? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0).toFixed(2);
      // data.superAdminPaymentAmount = (myPlans.length > 0 || companyDetails?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision?.value)) / 100 || 0);
      data.companyPaymentAmount = (commission - data.superAdminPaymentAmount).toFixed(2);
      data.driverPaymentAmount = (Number(data.price) - data.companyPaymentAmount - data.superAdminPaymentAmount).toFixed(2);
    } else {

      if (data?.price) {

        data.superAdminPaymentAmount = 0;
        data.companyPaymentAmount = 0;
        data.driverPaymentAmount = Number(data.price).toFixed(2);
      }
    }

    if (data?.trip_from) {
      const origin = `${ data.trip_from.lat},${data.trip_from.log}`;
      const destination = `${data.trip_to.lat},${data.trip_to.log}`;
      let distanceInfo = await getDistanceAndDuration(origin , destination)
      data.trip_distance = distanceInfo?.distance?.text ? (parseFloat(distanceInfo?.distance?.text)  * 0.621371).toFixed(2) : ''; // in miles
    }

    let update_trip = await TRIP.findOneAndUpdate(criteria, data, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('editTrip.error.unableToUpdateTrip'),
      });
    } else {

      let driver_data = await DRIVER.findOne({ _id: trip_data?.driver_name });

      // When Date and time will be updated then customer will be notify
      if (data?.pickup_date_time && new Date(data.pickup_date_time).getTime() !== new Date(trip_data.pickup_date_time).getTime()) {
        
        sendBookingUpdateDateTimeEmail(update_trip); // update user regarding the date time changed
        const companyDetail = await USER.findById(data?.created_by_company_id);
        if (companyDetail?.settings?.sms_options?.changing_pickup_time_request) { // check if company turned on sms feature for update date time trip
          
          sendTripUpdateToCustomerViaSMS(update_trip , constant.SMS_EVENTS.CHANGE_PICKUP_DATE_TIME);
        }
      }
    }

    return res.send({
                        code: constant.success_code,
                        message: res.__('editTrip.success.tripUpdated'),
                        result: update_trip,
                      });

  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}


exports.edit_trip = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let trip_data = await TRIP.findOne(criteria);

    let option = { new: true };
    data.status = true;

    if (data?.car_type) { // when commission will be changed 

      if (data?.commission && data?.commission?.commission_value != 0) {
      
        let commission = data.commission.commission_value;
        if ( data.commission.commission_type === constant.TRIP_COMMISSION_TYPE.PERCENTAGE && data.commission.commission_value > 0 ) {
          commission = (Number(data.price) * data.commission.commission_value) / 100;
        }

        const companyDetails = await USER.findById(trip_data?.created_by_company_id);
        const isCommisionPay = await willCompanyPayCommissionOnTrip(req.user);


        if (!isCommisionPay?.paidPlan && !isCommisionPay?.specialPlan){

          return res.send({
                            code: constant.error_code,
                            result: res.__('editTrip.error.noActivePlanForTripCreation'),
                          });
        }

        const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});
        
        data.superAdminPaymentAmount = !isCommisionPay.commision  ? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0).toFixed(2);
        // data.superAdminPaymentAmount = (myPlans.length > 0 || companyDetails?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision?.value)) / 100 || 0);
        data.companyPaymentAmount = (commission - data.superAdminPaymentAmount).toFixed(2);
        data.driverPaymentAmount = (Number(data.price) - data.companyPaymentAmount - data.superAdminPaymentAmount).toFixed(2);
  
      } else {

        if (data?.price) {

          data.superAdminPaymentAmount = 0;
          data.companyPaymentAmount = 0;
          data.driverPaymentAmount = Number(data.price).toFixed(2);
        }
      }
    }

    if (data?.trip_from) {
      const origin = `${ data.trip_from.lat},${data.trip_from.log}`;
      const destination = `${data.trip_to.lat},${data.trip_to.log}`;
      let distanceInfo = await getDistanceAndDuration(origin , destination)
      data.trip_distance = distanceInfo?.distance?.text ? (parseFloat(distanceInfo?.distance?.text)  * 0.621371).toFixed(2) : ''; // in miles
    }

    if (data?.trip_status == constant.TRIP_STATUS.CANCELED) {
      
      data.trip_cancelled_by_role = req.companyPartnerAccess ? constant.TRIP_CANCELLED_BY_ROLE.PARTNER_ACCESS : constant.TRIP_CANCELLED_BY_ROLE.COMPANY;
      data.trip_cancelled_by = req.companyPartnerAccess ? req.CompanyPartnerDriverId : req.userId;
      data.trip_cancelled_by_ref = req.companyPartnerAccess ? 'driver' : 'user';
      data.cancelled_at = new Date();
    }
    
   
    let update_trip = await TRIP.findOneAndUpdate(criteria, data, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('editTrip.error.unableToUpdateTrip'),
      });
    } else {

      let driver_data = await DRIVER.findOne({ _id: trip_data?.driver_name });

      // When Date and time will be updated then customer will be notify
      if (data?.pickup_date_time && new Date(data.pickup_date_time).getTime() !== new Date(trip_data.pickup_date_time).getTime()) {
        
        sendBookingUpdateDateTimeEmail(update_trip); // update user regarding the date time changed
        const companyDetail = await USER.findById(data?.created_by_company_id);
        if (companyDetail?.settings?.sms_options?.changing_pickup_time_request) { // check if company turned on sms feature for update date time trip
          
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
        
        req.io.to(driver_data.socketId).emit("popUpClose", { message: res.__('editTrip.socket.tripRetrivedByCompany')})
      }

      if ( data?.trip_status == constant.TRIP_STATUS.PENDING && trip_data.driver_name !== null && trip_data.driver_name != "null" && trip_data.driver_name != "" ) {

        let driver_data = await DRIVER.findOne({ _id: trip_data.driver_name });

        let device_token = driver_data?.deviceToken;
        if (device_token == "" || device_token == null) {

          let driver_data_created_by = await USER.findOne({ _id: driver_data.created_by,  });
          device_token = driver_data_created_by.deviceToken;
        }
      }

      // When driver is going to take the customer 
      if (update_trip?.trip_status == constant.TRIP_STATUS.REACHED) {

        await DRIVER.findOneAndUpdate({_id: update_trip?.driver_name}, {status: true}, option); 
      }

      //  he has been start the trip from starting point after taking the customer
      if (update_trip?.trip_status == constant.TRIP_STATUS.ACTIVE) {

        await DRIVER.findOneAndUpdate({_id: update_trip?.driver_name}, {status: true , is_available: false , is_in_ride: true}, option); 
      }

      // When driver will be complete his trip
      if (data?.trip_status == constant.TRIP_STATUS.COMPLETED) {

        await DRIVER.findOneAndUpdate({_id: update_trip?.driver_name}, {is_available: true , is_in_ride: false}, option); // set driver as not available
      }

      // When company wants to cancel or delete the trip then customer will be notify
      if (data?.trip_status == constant.TRIP_STATUS.CANCELED && update_trip?.customerDetails?.email) {
        sendBookingCancelledEmail(update_trip)
      }

      // refresh trip functionality for the drivers who have account access as partner
      
      partnerAccountRefreshTrip(trip_data.created_by_company_id , res.__('editTrip.socket.tripChangedRefresh'), req.io);

      if (driver_data) {
        const isDriverHasAccess = await isDriverHasCompanyAccess(driver_data , trip_data.created_by_company_id);

        // If driver doesn't have company acces then we can refresh the trip from driver side because he will be refreshed by partnerAccountRefreshTrip function
        if (!isDriverHasAccess) {

          console.log('refreshTrip--------------socketId' , driver_data?.socketId)
          await req.io.to(driver_data?.socketId).emit("refreshTrip", { message: '' } )
        }
      }
      
      let responseMessage = res.__('editTrip.success.tripUpdated');
      if (data?.trip_status == constant.TRIP_STATUS.CANCELED) { // change the message when trip is canceled
        responseMessage = res.__('getTrip.success.tripCancelled');
      }
      return res.send({
                        code: constant.success_code,
                        message: responseMessage,
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
        message: res.__('editTrip.error.unableToUpdateTrip'),
      });
    } else {
      
      // If the driver does not find the customer at the trip's starting location, it will be classified as a "no-show" case.
      noShowTrip(trip_data.created_by_company_id , trip_data  , res.__('noShowUser.success.driverUnableToLocateCustomer' , {trip_id: update_trip.trip_id}) , req.io);

      // Implement a "Refresh Trip" functionality for drivers with partner account access.
      
      partnerAccountRefreshTrip(trip_data.created_by_company_id , res.__('editTrip.socket.tripChangedRefresh'), req.io);
      return res.send({
                        code: constant.success_code,
                        message:res.__('editTrip.success.tripUpdated'),
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

exports.driverCancelTrip = async (req, res) => {
  try{
    
    let data = req.body;
    let criteria = { _id: req.params.id };
    let tripInfo = await TRIP.findOne(criteria);

    if (!criteria) {
      return res.send({
                      code: constant.error_code,
                      message: res.__('driverCancelTripReason.error.invalidTrip'),
                    });
    }

    if (criteria?.under_cancellation_review) {
      return res.send({
                      code: constant.error_code,
                      message: res.__('driverCancelTripReason.error.tripUnderCancellationReview'),
                    });
    }


    // Saving the trip cancel reason and its request info
    const trip_cancellation_request_data = {
      trip_id: tripInfo._id,
      driver_id: req.userId,
      company_id: tripInfo.created_by_company_id,
      cancellation_reason: req.body.cancellation_reason,
      trip_status: tripInfo.trip_status,
      trip_sequence_id: tripInfo.trip_id
    }
    let tripCancellationRequest = await new TRIP_CANCELLATION_REQUEST(trip_cancellation_request_data);
    await tripCancellationRequest.save();

    let option = { new: true };
    data.status = true;

    const updateData = {  
      under_cancellation_review: true,
      trip_cancellation_request_id: tripCancellationRequest._id,
      cancellation_reason: req.body.cancellation_reason,
    }
    
    let update_trip = await TRIP.findOneAndUpdate(criteria, updateData, option); 
    // let updateDriverData = {}
    // if (update_trip.trip_status == constant.TRIP_STATUS.REACHED) {
    //   await DRIVER.findOneAndUpdate({_id: tripInfo?.driver_name}, {status: true , is_available: false , is_in_ride: true}, option); 
    // }
    
    partnerAccountRefreshTrip(tripInfo.created_by_company_id , res.__('driverCancelTripReason.socket.tripChangedRefresh'), req.io);
      
    return res.send({
      code: constant.success_code,
      message: res.__('driverCancelTripReason.success.tripCancellationRequestSubmitted')
    });
  } catch (err) {
    console.log('driverCancelTrip------', err)
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}

exports.driverCancelTripDecision = async (req, res) => {
  try {

    let tripDecisionStatus = req.body.tripDecision;
    let isNoShow = req.body?.noShow;
    let criteria = {  _id: req.params.id };
    let tripDetails = await TRIP.findOne(criteria);

    if (!tripDetails) {
      return res.send({
                      code: constant.error_code,
                      message: res.__('driverCancelTripReason.error.invalidTrip'),
                    });
    }

    if (!tripDetails.under_cancellation_review) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('driverCancelTripReason.error.tripNotUnderCancellationReview'),
                      });
    }

    let tripDecisionData =  {
                              
                              reviewer_action :{
                                action_taken: constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED == tripDecisionStatus ? constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED : constant.TRIP_CANCELLATION_REQUEST_STATUS.REJECTED,
                                reviewed_by_user: null,
                                reviewed_by_driver_partner: null,
                                reviewed_by_account_access_driver: null
                              },
                              reviewed_by_role: null
                            }
    let updatedBy = ''
    if (req.user?.role == constant.ROLES.COMPANY || req.user?.role == constant.ROLES.ADMIN || req.user?.role == constant.ROLES.SUPER_ADMIN) {

      tripDecisionData.reviewed_by_role = req.companyPartnerAccess ? constant.ROLES.DRIVER : req.user?.role;

      updatedBy = req.user?.role == constant.ROLES.ADMIN || req.user?.role == constant.ROLES.SUPER_ADMIN ? 'Admin' : 'Company'
      
      if (req.companyPartnerAccess ) {// if driver has company's partner access
        tripDecisionData.reviewer_action.reviewed_by_driver_partner =  req.CompanyPartnerDriverId;
      } else {
        tripDecisionData.reviewer_action.reviewed_by_user =  req.user?._id
      }
      
    } else {
      tripDecisionData.reviewed_by_role = constant.ROLES.DRIVER;
    }

    // Update trip request
    await TRIP_CANCELLATION_REQUEST.findOneAndUpdate({_id: tripDetails?.trip_cancellation_request_id}, { $set:tripDecisionData}, {new: true}); 
    
    const tripUpdateData = {under_cancellation_review: false , trip_cancellation_request_id: null};

    // getback the trip from driver and sent it to the company
    if (tripDecisionStatus == constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED) {
      tripUpdateData.driver_name = null;
      tripUpdateData.trip_status = isNoShow ? constant.TRIP_STATUS.NO_SHOW : constant.TRIP_STATUS.PENDING;

      await DRIVER.findOneAndUpdate({_id: tripDetails?.driver_name}, { $set:{is_available: true}}, {new: true});
    }

    await TRIP.findOneAndUpdate(criteria , tripUpdateData, {new: true});

    // Refesh the trip for the company and its partner and account access drivers
    partnerAccountRefreshTrip(tripDetails.created_by_company_id ,res.__('driverCancelTripReason.socket.tripChangedRefresh'),  req.io);

    let message = '';

    if (tripDecisionStatus == constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED) {
      message = res.__('driverCancelTripReason.socket.tripCancellationApproved' , {trip_id: tripDetails?.trip_id , updatedBy: updatedBy})
    } else {
      message = res.__('driverCancelTripReason.socket.tripCancellationRejected' , {trip_id: tripDetails?.trip_id , updatedBy: updatedBy})
    }
      // Send notification to the driver and inform by the socket but company and driver are same person then no notification or pop-up will be show
    if ( (tripDetails?.driver_name.toString() != req.user?.driverId?._id.toString()) ||  req.companyPartnerAccess) {
      let driver_data = await DRIVER.findOne({ _id: tripDetails.driver_name });

      let device_token = driver_data?.deviceToken;
      if ((device_token == "" || device_token == null) && driver_data?.isCompany) {

        let driverCompany = await USER.findOne({ _id: driver_data.driver_company_id,  });
        device_token = driverCompany.deviceToken ? driverCompany.deviceToken : null;
      }

      const isDriverHasAccess = await isDriverHasCompanyAccess(driver_data , tripDetails.created_by_company_id)
      console.log('isDriverHasAccess--------------' , isDriverHasAccess)


      if (driver_data?.socketId) {
        req.io.to(driver_data.socketId).emit("tripCancellationRequestDecision", {
          message: message,
          tripDecisionStatus: constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED == tripDecisionStatus ? constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED : constant.TRIP_CANCELLATION_REQUEST_STATUS.REJECTED,
          tripDetails:tripDetails
        });

        

        // If driver doesn't have company acces then we can refresh the trip from driver side because he will be refreshed by partnerAccountRefreshTrip function
        if (!isDriverHasAccess) {

          console.log('refreshTrip--------------socketId' , driver_data?.socketId)
          await req.io.to(driver_data?.socketId).emit("refreshTrip", { message: message } )
        }
      }

      if (driver_data?.webSocketId) {
        req.io.to(driver_data.webSocketId).emit("tripCancellationRequestDecision", {
                                                                                      message: message,
                                                                                      tripDecisionStatus: constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED == tripDecisionStatus ? constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED : constant.TRIP_CANCELLATION_REQUEST_STATUS.REJECTED,
                                                                                      tripDetails:tripDetails
                                                                                    }
                                                );

        if (!isDriverHasAccess) {
          console.log('refreshTrip--------------')
          await req.io.to(driver_data?.webSocketId).emit("refreshTrip", { message: message } )
        }
        
      }
      
      if (device_token) {
        sendNotification(
                          device_token,
                          res.__('driverCancelTripReason.socket.tripCancellationStatusMessage' , {trip_id: tripDetails?.trip_id , tripDecisionStatus: tripDecisionStatus}),
                          res.__('driverCancelTripReason.socket.tripCancellationStatusTitle' , {trip_id: tripDetails?.trip_id , tripDecisionStatus: tripDecisionStatus}),
                          tripDetails
                        );
      }
    }


    let excludePartnerDriver = [tripDetails.driver_name];

    if (req.companyPartnerAccess) {
      excludePartnerDriver.push(req.CompanyPartnerDriverId)
    }
    // For the driver who has company access
            
    const driverHasCompanyAccess = await DRIVER.find({
                                                        _id: { $nin: excludePartnerDriver}, 
                                                        company_account_access  : {
                                                                                    $elemMatch: { company_id: new mongoose.Types.ObjectId(tripDetails.created_by_company_id) },
                                                                                  },
                                                    });

    if (driverHasCompanyAccess){

      for (let driverCompanyAccess of driverHasCompanyAccess) {
        
        if (driverCompanyAccess?.socketId) {

          req.io.to(driverCompanyAccess?.socketId).emit("tripCancellationRequestDecision", {
                                                      message: message,
                                                      tripDecisionStatus: constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED == tripDecisionStatus ? constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED : constant.TRIP_CANCELLATION_REQUEST_STATUS.REJECTED,
                                                      tripDetails:tripDetails
                                                    });
        }

        if (driverCompanyAccess?.webSocketId) {

          req.io.to(driverCompanyAccess?.webSocketId).emit("tripCancellationRequestDecision", {
                                                        message: message,
                                                        tripDecisionStatus: constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED == tripDecisionStatus ? constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED : constant.TRIP_CANCELLATION_REQUEST_STATUS.REJECTED,
                                                        tripDetails:tripDetails
                                                      });
        }

        if (driverCompanyAccess?.deviceToken) {

          sendNotification(
                            driverCompanyAccess?.deviceToken,
                            res.__('driverCancelTripReason.socket.tripCancellationStatusMessage' , {trip_id: tripDetails?.trip_id , tripDecisionStatus: tripDecisionStatus}),
                            res.__('driverCancelTripReason.socket.tripCancellationStatusTitle' , {trip_id: tripDetails?.trip_id , tripDecisionStatus: tripDecisionStatus}),
                            tripDetails
                          );
        }
      }
    }

    // functionality for the drivers who have account access as partner
    const driverHasCompanyPartnerAccess = await DRIVER.find({
                                                              _id: { $nin: excludePartnerDriver},
                                                              parnter_account_access : {
                                                                $elemMatch: { company_id: new mongoose.Types.ObjectId(tripDetails.created_by_company_id) },
                                                              },
                                                            });

    if (driverHasCompanyPartnerAccess){

      for (let partnerAccount of driverHasCompanyPartnerAccess) {

        // for partner app side
        if (partnerAccount?.socketId) {
          req.io.to(partnerAccount?.socketId).emit("tripCancellationRequestDecision", {
                                                message: message,
                                                tripDecisionStatus: constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED == tripDecisionStatus ? constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED : constant.TRIP_CANCELLATION_REQUEST_STATUS.REJECTED,
                                                tripDetails:tripDetails
                                              });
        }

        // for partner Web side
        if (partnerAccount?.webSocketId) {

          req.io.to(partnerAccount?.webSocketId).emit("tripCancellationRequestDecision", {
                                                    message: message,
                                                    tripDecisionStatus: constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED == tripDecisionStatus ? constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED : constant.TRIP_CANCELLATION_REQUEST_STATUS.REJECTED,
                                                    tripDetails:tripDetails
                                                  });
        }

        // If driver has device token to send the notification otherwise we can get device token his company account if has has company role
        if (partnerAccount?.deviceToken) {
          // notification for driver

          sendNotification(
                            partnerAccount?.deviceToken,
                            res.__('driverCancelTripReason.socket.tripCancellationStatusMessage' , {trip_id: tripDetails?.trip_id , tripDecisionStatus: tripDecisionStatus}),
                            res.__('driverCancelTripReason.socket.tripCancellationStatusTitle' , {trip_id: tripDetails?.trip_id , tripDecisionStatus: tripDecisionStatus}),
                            tripDetails
                          );
        } else if (partnerAccount.isCompany){

          const companyData = await USER.findById(partnerAccount.driver_company_id);
          if (companyData?.deviceToken) {
            // notification for company

            sendNotification(
                              companyData?.deviceToken,
                              res.__('driverCancelTripReason.socket.tripCancellationStatusMessage' , {trip_id: tripDetails?.trip_id , tripDecisionStatus: tripDecisionStatus}),
                              res.__('driverCancelTripReason.socket.tripCancellationStatusTitle' , {trip_id: tripDetails?.trip_id , tripDecisionStatus: tripDecisionStatus}),
                              tripDetails
                            );
          }
        }
      }
    }

    // notify the customer that his trip has been cancelled
    if (tripDecisionStatus == constant.TRIP_CANCELLATION_REQUEST_STATUS.APPROVED && tripDetails?.customerDetails?.email) {
      sendBookingCancelledEmail(tripDetails)
    }

    return res.send({
                      code: constant.success_code,
                      message:  res.__('driverCancelTripReason.success.tripCancellationUpdated'),
                      info:req.user
                    });
    
  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}

exports.customerCancelTrip = async (req , res) => {
  try {
    let data = req.body;
    let criteria = { _id: data.id };
    let tripInfo = await TRIP.findOne(criteria);

    if (!criteria) {
      return res.send({
                      code: constant.error_code,
                      message: res.__('customerCancelTrip.error.invalidTrip'),
                    });
    }

    if (criteria?.trip_status == constant.TRIP_STATUS.CANCELED) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('customerCancelTrip.error.tripAlreadyCancelledByUser'),
                      });
    }

    await TRIP.findOneAndUpdate(criteria, {$set:{
                                                  trip_status: constant.TRIP_STATUS.CANCELED , 
                                                  // driver_name: null , 
                                                  trip_cancelled_by_role: constant.TRIP_CANCELLED_BY_ROLE.USER,
                                                  cancelled_at : new Date(),
                                                  under_cancellation_review: false
                                                }}, {new: true});

   
    // const driverById = await DRIVER.findOne({ _id: tripInfo?.driver_name });
    const customerName = tripInfo?.customerDetails?.name;
    let user = await USER.findById(tripInfo?.created_by_company_id);
    const companyAgencyData = await AGENCY.findOne({user_id: tripInfo.created_by_company_id});

    if (user?.socketId) {
      
        req.io.to(user?.socketId).emit("tripCancelledBYCustomer", {
                                                              tripInfo,
                                                              message: res.__('customerCancelTrip.socket.tripCancelledByCustomer' , {customerName: customerName}),
                                                            }
                                  );
    }

    if (user?.webSocketId) {
      // socket for web
      req.io.to(user?.webSocketId).emit(
                                          "tripCancelledBYCustomer",
                                          {
                                            tripInfo,
                                            message: res.__('customerCancelTrip.socket.tripCancelledByCustomer' , {customerName: customerName}),
                                          },
                                        );
    }

    if (user?.deviceToken) {
      sendNotification(
                        user?.deviceToken,
                        res.__('customerCancelTrip.notification.tripCancelledByCustomerMessage' , {customerName: customerName , trip_id: tripInfo.trip_id}),
                        res.__('customerCancelTrip.notification.tripCancelledByCustomerTitle' , { trip_id: tripInfo.trip_id}),
                        tripInfo
                      );
    }

    // For the driver who has company access
            
    const driverHasCompanyAccess = await DRIVER.find({
                                                        company_account_access  : {
                                                                                    $elemMatch: { company_id: new mongoose.Types.ObjectId(tripInfo.created_by_company_id) },
                                                                                  },
                                                    });
    if (driverHasCompanyAccess){
    
      for (let driverCompanyAccess of driverHasCompanyAccess) {
        
        if (driverCompanyAccess?.socketId) {

          req.io.to(driverCompanyAccess?.socketId).emit(
                                                    "tripCancelledBYCustomer",
                                                    {
                                                      tripInfo,
                                                      message: res.__('customerCancelTrip.socket.tripCancelledByCustomer' , {customerName: customerName}),
                                                    },
                                                  );
        }

        if (driverCompanyAccess?.webSocketId) {

          req.io.to(driverCompanyAccess?.webSocketId).emit(
                                                        "tripCancelledBYCustomer",
                                                        {
                                                          tripInfo,
                                                          message: res.__('customerCancelTrip.socket.tripCancelledByCustomer' , {customerName: customerName}),
                                                        },
                                                      );
        }

        if (driverCompanyAccess?.deviceToken) {

          sendNotification(
                                  driverCompanyAccess?.deviceToken,
                                  res.__('customerCancelTrip.notification.tripCancelledByCustomerMessage' , {customerName: customerName , trip_id: tripInfo.trip_id}),
                                  res.__('customerCancelTrip.notification.tripCancelledByCustomerForCompanyAccessTitle' , {company_name: companyAgencyData.company_name , trip_id: tripInfo.trip_id}),
                                  tripInfo
                                );
        }

        if (driverCompanyAccess?.webDeviceToken) {

          sendNotification(
                                  driverCompanyAccess?.webDeviceToken,
                                  res.__('customerCancelTrip.notification.tripCancelledByCustomerMessage' , {customerName: customerName , trip_id: tripInfo.trip_id}),
                                  res.__('customerCancelTrip.notification.tripCancelledByCustomerForCompanyAccessTitle' , {company_name: companyAgencyData.company_name , trip_id: tripInfo.trip_id}),
                                  tripInfo
                                );
        }
      }
    }

    // functionality for the drivers who have account access as partner
    const driverHasCompanyPartnerAccess = await DRIVER.find({
                                                                parnter_account_access : {
                                                                  $elemMatch: { company_id: new mongoose.Types.ObjectId(tripInfo.created_by_company_id) },
                                                                },
                                                              });

     if (driverHasCompanyPartnerAccess){
    
        for (let partnerAccount of driverHasCompanyPartnerAccess) {

          // for partner app side
          if (partnerAccount?.socketId) {
            req.io.to(partnerAccount?.socketId).emit("tripCancelledBYCustomer",{
                                                                              tripInfo,
                                                                              message: res.__('customerCancelTrip.socket.tripCancelledByCustomer' , {customerName: customerName}),
                                                                            },
                                                );
              
            // for refresh trip
            req.io.to(partnerAccount?.socketId).emit( "refreshTrip", { message:  res.__('customerCancelTrip.socket.tripChangedRefresh')} );
          }

          // for partner Web side
          if (partnerAccount?.webSocketId) {

          req.io.to(partnerAccount?.webSocketId).emit("tripCancelledBYCustomer",{
                                                                              tripInfo,
                                                                              message: res.__('customerCancelTrip.socket.tripCancelledByCustomer' , {customerName: customerName}),
                                                                            },
                                                )

          req.io.to(partnerAccount?.webSocketId).emit("refreshTrip",  {  message:res.__('customerCancelTrip.socket.tripChangedRefresh') } );
          }

          if (partnerAccount?.webDeviceToken) {
            // notification for driver

            sendNotification(
                              partnerAccount?.webDeviceToken,
                              res.__('customerCancelTrip.notification.tripCancelledByCustomerMessage' , {customerName: customerName , trip_id: tripInfo.trip_id}),
                              res.__('customerCancelTrip.notification.tripCancelledByCustomerForPartnerAccessTitle' , {company_name: companyAgencyData.company_name , trip_id: tripInfo.trip_id}),
                              tripInfo
                            );
          }

          // If driver has device token to send the notification otherwise we can get device token his company account if has has company role
          if (partnerAccount?.deviceToken) {
            // notification for driver

            sendNotification(
                              partnerAccount?.deviceToken,
                              res.__('customerCancelTrip.notification.tripCancelledByCustomerMessage' , {customerName: customerName , trip_id: tripInfo.trip_id}),
                              res.__('customerCancelTrip.notification.tripCancelledByCustomerForPartnerAccessTitle' , {company_name: companyAgencyData.company_name , trip_id: tripInfo.trip_id}),
                              tripInfo
                            );
          } else if (partnerAccount.isCompany){

            const companyData = await USER.findById(partnerAccount.driver_company_id);
            if (companyData?.deviceToken) {
              // notification for company

              sendNotification(
                                companyData?.deviceToken,
                                res.__('customerCancelTrip.notification.tripCancelledByCustomerMessage' , {customerName: customerName , trip_id: tripInfo.trip_id}),
                                res.__('customerCancelTrip.success.tripCancelledByCustomerForPartnerAccessTitle' , {company_name: companyAgencyData.company_name , trip_id: tripInfo.trip_id}),
                                tripInfo
                              );
            }
          }
        }
      }
    return res.send({
      code: constant.success_code,
      message: res.__('customerCancelTrip.notification.customercancellTrip')
    });
  } catch (err) {
    console.log('customerCancelTrip------', err)
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}

exports.driverCancelTripRequests = async (req, res) => {
  try {

    const page = parseInt(req.query.page) || 1; // default to page 1
    const limit = parseInt(req.query.limit) || 10; // default to 10 items per page
    const skip = (page - 1) * limit;
    const date = req.query.date ? new Date(req.query.date) : null;

    // Optional filter (e.g., by user or company)
    let filter = { 
                    is_deleted: false,
                    under_cancellation_review: true,
                  };

    if (date) {
      const startOfDay = new Date(date.setUTCHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setUTCHours(23, 59, 59, 999));
      dateFilter.updatedAt = { $gte: startOfDay, $lte: endOfDay };
    }

    if (req.user.role == constant.ROLES.COMPANY) {

      dateFilter.created_by_company_id = req.user._id;
    } else if (req.user.role == constant.ROLES.DRIVER) {

      dateFilter.created_by_company_id = req.query?.company_id;
    }
    let tripInfo = await TRIP.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);
    const total = await TRIP.countDocuments(filter);

    return res.send({
                      code: constant.success_code,
                      data: tripInfo,
                      currentPage: page,
                      totalPages: Math.ceil(total / limit),
                      totalTrips: total
                    });
  } catch (err) {
    console.log('driverCancelTripRequests------', err)
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}

exports.access_update_trip = async (req , res) => {
  try {
    let data = req.body;

    if (req.user.role == constant.ROLES.DRIVER) {

      let is_driver_has_company_access = await isDriverHasCompanyAccess( req.user, req.params.company_id );

      if (!is_driver_has_company_access) {

        return res.send({
                          code: constant.ACCESS_ERROR_CODE,
                          message: res.__('editTrip.error.companyAccessRevoked'),
                        });
      }
    }

    let criteria = { _id: req.params.id };
    let trip_data = await TRIP.findOne(criteria);

    let option = { new: true };
    data.status = true;

    if (data?.commission && data?.commission?.commission_value != 0) {

      let commission = data.commission.commission_value;
      if ( data.commission.commission_type === constant.TRIP_COMMISSION_TYPE.PERCENTAGE && data.commission.commission_value > 0 ) {
        commission = (data.price * data.commission.commission_value) / 100;
      }

      const companyDetails = await USER.findById(trip_data?.created_by_company_id);
      if (!isCommisionPay?.paidPlan && !isCommisionPay?.specialPlan){

        return res.send({
                          code: constant.error_code,
                          result: res.__('editTrip.error.noActivePlanForTripCreation'),
                        });
      }
      const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});

      
      data.superAdminPaymentAmount = !isCommisionPay.commision  ? 0 : ((Number(commission) * parseFloat(adminCommision.value)) / 100 || 0).toFixed(2);
      // data.superAdminPaymentAmount = (myPlans.length > 0 || companyDetails?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0);
      data.companyPaymentAmount = (Number(commission) - Number(data.superAdminPaymentAmount)).toFixed(2);
      data.driverPaymentAmount = (Number(data.price) - data.companyPaymentAmount - data.superAdminPaymentAmount).toFixed(2);

    } else {

      if (data?.price) {
        data.superAdminPaymentAmount = 0;
        data.companyPaymentAmount = 0;
        
        data.driverPaymentAmount = Number(data.price).toFixed(2)
      }
      
    }

    if (data?.trip_from) {
      const origin = `${ data.trip_from.lat},${data.trip_from.log}`;
      const destination = `${data.trip_to.lat},${data.trip_to.log}`;
      let distanceInfo = await getDistanceAndDuration(origin , destination)
      data.trip_distance = distanceInfo?.distance?.text ? (parseFloat(distanceInfo?.distance?.text)  * 0.621371).toFixed(2) : ''; // in miles
    }

    
    let update_trip = await TRIP.findOneAndUpdate(criteria, data, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('editTrip.error.unableToUpdateTrip'),
      });
    } else {
      // When Date and time will be updated then customer will be notify
      if (data?.pickup_date_time && new Date(data.pickup_date_time).getTime() !== new Date(trip_data.pickup_date_time).getTime()) {
        
        sendBookingUpdateDateTimeEmail(update_trip); // update user regarding the date time changed
        const companyDetail = await USER.findById(data?.created_by_company_id);
        if (companyDetail?.settings?.sms_options?.trip_ceate_request) { // check if company turned on sms feature for update date time trip
          
          sendTripUpdateToCustomerViaSMS(update_trip , constant.SMS_EVENTS.CHANGE_PICKUP_DATE_TIME);
        }
      }
    }

    return res.send({
                        code: constant.success_code,
                        message: res.__('editTrip.success.tripUpdated'),
                        result: update_trip,
                      });

  
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.access_edit_trip = async (req, res) => {
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
                          message: res.__('editTrip.error.companyAccessRevoked'),
                        });
      }
    }

    let criteria = { _id: req.params.id };
    let trip_data = await TRIP.findOne(criteria);

    let option = { new: true };
    data.status = true;
    
    if (data?.commission && data?.commission?.commission_value != 0) {

      let commission = data.commission.commission_value;
      if ( data.commission.commission_type === constant.TRIP_COMMISSION_TYPE.PERCENTAGE && data.commission.commission_value > 0 ) {
        commission = (data.price * data.commission.commission_value) / 100;
      }

      const companyDetails = await USER.findById(trip_data?.created_by_company_id);
      if (!isCommisionPay?.paidPlan && !isCommisionPay?.specialPlan){

        return res.send({
                          code: constant.error_code,
                          result: res.__('editTrip.error.noActivePlanForTripCreation'),
                        });
      }
      const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});

      
      data.superAdminPaymentAmount = !isCommisionPay.commision  ? 0 : ((Number(commission) * parseFloat(adminCommision.value)) / 100 || 0).toFixed(2);
      // data.superAdminPaymentAmount = (myPlans.length > 0 || companyDetails?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0);
      data.companyPaymentAmount = (Number(commission) - Number(data.superAdminPaymentAmount)).toFixed(2);
      data.driverPaymentAmount = (Number(data.price) - data.companyPaymentAmount - data.superAdminPaymentAmount).toFixed(2);

    } else {

      if (data?.price) {
        data.superAdminPaymentAmount = 0;
        data.companyPaymentAmount = 0;
        
        data.driverPaymentAmount = Number(data.price).toFixed(2)
      }
      
    }

    if (data?.trip_from) {
      const origin = `${ data.trip_from.lat},${data.trip_from.log}`;
      const destination = `${data.trip_to.lat},${data.trip_to.log}`;
      let distanceInfo = await getDistanceAndDuration(origin , destination)
      data.trip_distance = distanceInfo?.distance?.text ? (parseFloat(distanceInfo?.distance?.text)  * 0.621371).toFixed(2) : ''; // in miles
    }

    if (data?.trip_status == constant.TRIP_STATUS.CANCELED) {
      
      data.trip_cancelled_by_role = constant.TRIP_CANCELLED_BY_ROLE.COMPANY_PARTIAL_ACCESS;
      data.trip_cancelled_by =  req.userId;
      data.trip_cancelled_by_ref = 'driver' ;
      data.cancelled_at = new Date();
    }
    
    let update_trip = await TRIP.findOneAndUpdate(criteria, data, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('editTrip.error.unableToUpdateTrip'),
      });
    } else {

      // When Date and time will be updated then customer will be notify
      if (data?.pickup_date_time && new Date(data.pickup_date_time).getTime() !== new Date(trip_data.pickup_date_time).getTime()) {
        
        sendBookingUpdateDateTimeEmail(update_trip); // update user regarding the date time changed
        const companyDetail = await USER.findById(data?.created_by_company_id);
        if (companyDetail?.settings?.sms_options?.changing_pickup_time_request) { // check if company turned on sms feature for update date time trip
          
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
      
      if ( data?.trip_status == constant.TRIP_STATUS.PENDING && trip_data.driver_name !== null && trip_data.driver_name != "null" && trip_data.driver_name != "" ) {
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
                                                    res.__('editTrip.notification.tripRetrievedByCompanyMessage' , {trip_id: trip_data.trip_id}),
                                                    res.__('editTrip.notification.tripRetrievedByCompanyTitle'),
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

      partnerAccountRefreshTrip(update_trip.created_by_company_id , res.__('editTrip.socket.tripChangedRefresh'), req.io);
      return res.send({
                        code: constant.success_code,
                        message: res.__('editTrip.success.tripUpdated'),
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
        trip_status: constant.TRIP_STATUS.CANCELED,
      },
    };
    let update_trip = await TRIP.findOneAndUpdate(criteria, newValue, option);
    if (!update_trip) {
      res.send({
        code: constant.error_code,
        message: res.__('deleteTrip.error.unableToDeleteTrip'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('deleteTrip.success.deletedSuccessfully'),
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};
