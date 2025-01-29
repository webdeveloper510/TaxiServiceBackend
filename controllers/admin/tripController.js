require("dotenv").config();
const AGENCY = require("../../models/user/agency_model");
const DRIVER = require("../../models/user/driver_model");
const USER = require("../../models/user/user_model");
const VEHICLETYPE = require("../../models/admin/vehicle_type");
const { getNextSequenceValue } = require("../../models/user/trip_counter_model");
var FARES = require("../../models/user/fare_model");
// const FARES = require('../../models/admin/fare_model')
const TRIP = require("../../models/user/trip_model");
const multer = require("multer");
const path = require("path");
const constant = require("../../config/constant");
const geolib = require("geolib");
const mongoose = require("mongoose");
const randToken = require("rand-token").generator();
const moment = require("moment");
const { sendNotification } = require("../../Service/helperFuntion");
const { isDriverHasCompanyAccess , getCompanyActivePaidPlans } = require("../../Service/helperFuntion");
const {partnerAccountRefreshTrip} = require("../../Service/helperFuntion");
const trip_model = require("../../models/user/trip_model");
const user_model = require("../../models/user/user_model");
const { default: axios } = require("axios");
const driver_model = require("../../models/user/driver_model");
const nodemailer = require("nodemailer");
const emailConstant = require("../../config/emailConstant");
const twilio = require("twilio");

const tripIsBooked = async (tripId, driver_info, io) => {

  const driver_full_info = await driver_model.findOne({ _id: driver_info._id, });

  try {
    const tripById = await trip_model.findOne({
                                                _id: tripId,
                                                trip_status: "Accepted",
                                              });

    if (tripById) {
      const updateDriver = await driver_model.findByIdAndUpdate(
                                                                  tripById.driver_name,
                                                                  { is_available: true }
                                                                );
      tripById.driver_name = null;
      tripById.trip_status = "Pending";
      await tripById.save();

      const user = await user_model.findById(tripById.created_by_company_id);
      const agency = await AGENCY.findOne({ user_id: tripById.created_by_company_id, });

      // for company app side
      if (user?.socketId) {
        io.to(user?.socketId).emit("tripNotAcceptedBYDriver", {
                                                                trip: tripById,
                                                                message: "Trip not accepted by the Driver",
                                                              });
        await io.to(user?.socketId).emit("refreshTrip", { 
                                                          message: "Trip not accepted by driver. Please refresh the data"
                                                        } );
      }

      // for company web side
      if (user?.webSocketId) {
        io.to(user?.webSocketId).emit("tripNotAcceptedBYDriver", {
                                                                    trip: tripById,
                                                                    message: "Trip not accepted by the Driver",
                                                                  });

        io.to(user?.webSocketId).emit("refreshTrip", {
                                                      message: "Driver didn't accpet the trip. Please refresh the data",
                                                    });
      }

      // for driver app side
      if (driver_full_info?.socketId) {
        io.to(driver_full_info?.socketId).emit("popUpClose", {
                                                                trip: tripById,
                                                                message: "Close up socket connection",
                                                              });
      }

      // for driver Web side
      if (driver_full_info?.webSocketId) {
        // for web app side
        io.to(driver_full_info?.webSocketId).emit("popUpClose", {
                                                                  trip: tripById,
                                                                  message: "Close up socket connection",
                                                                });
      }

      if (user?.deviceToken) {
        // notification for company

        await sendNotification(
                                user?.deviceToken,
                                `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                                `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                                updateDriver
                              );
      }

      // Functionality for assigned driver

      const company_assigned_driverIds = user.company_account_access.map((item) => item.driver_id); // get the assigned driver

      if (company_assigned_driverIds.length > 0) {

        // get driver device token for notification
        const drivers_info_for_token = await driver_model.find({
                                                                _id: { $in: company_assigned_driverIds, $ne: driver_full_info._id },
                                                                status: true,
                                                                deviceToken: { $ne: null }, // device_token should not be null
                                                              });

        // Send the notification to assigned drivers
        if (drivers_info_for_token.length > 0) {
          const company_assigned_driver_token = drivers_info_for_token.map( (item) => item.deviceToken );

          company_assigned_driver_token.forEach(async (driver_device_token) => {
            if (driver_device_token) {
              let send_notification = await sendNotification(
                                                              driver_device_token,
                                                              `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                                                              agency.company_name +
                                                                `'s Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                                                              updateDriver
                                                            );
            }
          });
        }

        // get driver device token for notification
        const drivers_info_for_socket_ids_app = await driver_model.find({
                                                                          _id: { $in: company_assigned_driverIds, $ne: driver_full_info._id },
                                                                          status: true,
                                                                          socketId: { $ne: null }, // device_token should not be null
                                                                        });

        const drivers_info_for_socket_ids_web = await driver_model.find({
                                                                          _id: { $in: company_assigned_driverIds, $ne: driver_full_info._id },
                                                                          status: true,
                                                                          webSocketId: { $ne: null }, // webSocketId should not be null
                                                                        });

        const company_assigned_driver_sockets_web = drivers_info_for_socket_ids_web.map((item) => item.webSocketId);
        const company_assigned_driver_sockets_app = drivers_info_for_socket_ids_app.map((item) => item.socketId);

        const driverSocketIds = company_assigned_driver_sockets_web.concat(
          company_assigned_driver_sockets_app
        );

        // Send the socket to assigned drivers
        if (driverSocketIds.length > 0) {
          driverSocketIds.forEach(async (socketId) => {
            if (socketId) {
              await io.to(socketId).emit(
                "tripNotAcceptedBYDriver",
                {
                  trip: tripById,
                  message:
                    agency.company_name + "'s Trip not accepted by the Driver",
                },
                (err, ack) => {
                  if (ack) {
                  } else {
                  }
                }
              );

              io.to(socketId).emit("refreshTrip", {
                message:
                  "Driver didn't accpet the trip. Please refresh the data",
              });
            }
          });
        }
      }

      // functionality for the drivers who have account access as partner

      const driverHasCompanyPartnerAccess = await DRIVER.find({
                                                                parnter_account_access : {
                                                                  $elemMatch: { company_id: new mongoose.Types.ObjectId(user._id) },
                                                                },
                                                              });

      if (driverHasCompanyPartnerAccess){

        for (let partnerAccount of driverHasCompanyPartnerAccess) {

          // for partner app side
          if (partnerAccount?.socketId) {
           
            await io.to(partnerAccount?.socketId).emit("tripNotAcceptedBYDriver", {
                                                                                    trip: tripById,
                                                                                    message: "Trip not accepted by the Driver",
                                                                                  }
                                                      );

            await io.to(partnerAccount?.socketId).emit("refreshTrip", { 
                                                                        message: "Trip not accepted by driver. Please refresh the data"
                                                                      } 
                                                      );
          }

          // for partner Web side
          if (partnerAccount?.webSocketId) {

          await io.to(partnerAccount?.socketId).emit("tripNotAcceptedBYDriver", {
                                      trip: tripById,
                                      message: "Trip not accepted by the Driver",
                                    });

          await io.to(partnerAccount?.webSocketId).emit("refreshTrip",  {
                              message: "Driver didn't accpet the trip. Please refresh the data",
                            });
          }

          // If driver has device token to send the notification otherwise we can get device token his company account if has has company role
          if (partnerAccount?.deviceToken) {
            // notification for driver

            await sendNotification(
                                  partnerAccount?.deviceToken,
                                  `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                                  `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                                  updateDriver
                                  );
          } else if (partnerAccount.isCompany){

            const companyData = await user_model.findById(partnerAccount.driver_company_id);
            if (companyData?.deviceToken) {
              // notification for company

              await sendNotification(
                                      companyData?.deviceToken,
                                      `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                                      `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                                      updateDriver
                                    );
            }
          }
        }
      }
    }
  } catch (err) {
    console.log("🚀 ~ tripIsBooked ~ err:", err);
  }
};

exports.add_trip = async (req, res) => {
  try {
    let data = req.body;
    data.created_by = data.created_by ? data.created_by : req.userId;
    // data.trip_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
    data.trip_id    = await getNextSequenceValue();
    let token_code  = randToken.generate( 4, "1234567890abcdefghijklmnopqrstuvxyz" );
    let check_user  = await USER.findOne({ _id: req.userId });
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

    let series      = Number(check_id.length) + 1;
    data.series_id  = token_code + "-" + "000" + series;

    data.trip_id = "T" + "-" + data.trip_id;
    let distance = ( geolib.getDistance( {
                                            latitude: data.trip_from.log,
                                            longitude: data.trip_from.lat,
                                          },
                                          {
                                            latitude: data.trip_to.log,
                                            longitude: data.trip_to.lat,
                                          }
                                        ) * 0.00062137
                                      ).toFixed(2);

    let getFare = await FARES.findOne({ vehicle_type: data.vehicle_type });
    let fare_per_km = getFare ? Number(getFare.vehicle_fare_per_km ? getFare.vehicle_fare_per_km : 12) : 10;

    if (!data.price) {
      data.price = (fare_per_km * Number(distance)).toFixed(2);
    }

    if (data?.commission && data?.commission?.commission_value != 0) {
      
      let commission = data.commission.commission_value;
      if ( data.commission.commission_type === "Percentage" && data.commission.commission_value > 0 ) {
        commission = (data.price * data.commission.commission_value) / 100;
      }

      
      const company = await AGENCY.findOne({ user_id: data.created_by_company_id, });
      data.superAdminPaymentAmount = (commission * parseFloat(company.commision)) / 100 || 0;
      data.companyPaymentAmount = commission - data.superAdminPaymentAmount;
      data.driverPaymentAmount = data.price - data.companyPaymentAmount - data.superAdminPaymentAmount;

    } else {
      data.superAdminPaymentAmount = 0;
      data.companyPaymentAmount = 0;
      data.driverPaymentAmount = data.price
    }

    
    let add_trip = await TRIP(data).save();
    if (!add_trip) {
      return res.send({
                        code: constant.error_code,
                        message: "Unable to create the trip",
                      });
    } else {


      // refresh trip functionality for the drivers who have account access as partner

      partnerAccountRefreshTrip(data.created_by_company_id , "A trip has been created.Please refresh the data",  req.io);
      return res.send({
                        code: constant.success_code,
                        message: "Saved Successfully",
                        result: add_trip,
                      });
    }
  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.access_add_trip = async (req, res) => {
  try {
    if (req.user.role == "DRIVER") {
      let is_driver_has_company_access = await isDriverHasCompanyAccess(
        req.user,
        req.body.created_by_company_id
      );

      if (!is_driver_has_company_access) {
        res.send({
          code: constant.ACCESS_ERROR_CODE,
          message: "The company's access has been revoked",
        });
        return;
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
                                          ]
                                        );

      let series = Number(check_id.length) + 1;
      data.series_id = token_code + "-" + "000" + series;

      data.trip_id = "T" + "-" + data.trip_id;
      let distance = (geolib.getDistance(
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

      let getFare = await FARES.findOne({ vehicle_type: data.vehicle_type });
      let fare_per_km = getFare ? Number(getFare.vehicle_fare_per_km ? getFare.vehicle_fare_per_km : 12) : 10;
      if (!data.price) {
        data.price = (fare_per_km * Number(distance)).toFixed(2);
      }


      if (data?.commission && data?.commission?.commission_value != 0) {
        
        let commission = data.commission.commission_value;
        if ( data.commission.commission_type === "Percentage" && data.commission.commission_value > 0 ) {
          commission = (data.price * data.commission.commission_value) / 100;
        }

        const company = await AGENCY.findOne({ user_id: data.created_by_company_id, });
        data.superAdminPaymentAmount = (commission * parseFloat(company.commision)) / 100 || 0;
        data.companyPaymentAmount = commission - data.superAdminPaymentAmount;
        data.driverPaymentAmount = data.price - data.companyPaymentAmount - data.superAdminPaymentAmount;
      } else {
        data.superAdminPaymentAmount = 0;
        data.companyPaymentAmount = 0;
        data.driverPaymentAmount = data.price
      }


      let add_trip = await TRIP(data).save();
    // }
    

    if (!add_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to create the trip",
      });
    } else {

       // refresh trip functionality for the drivers who have account access as partner
      
       partnerAccountRefreshTrip(data.created_by_company_id , "A trip has been created.Please refresh the data", req.io);
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

exports.add_trip_link = async (req, res) => {
  try {
    let data = req.body;
    data.created_by = data.created_by;
    data.trip_id = randToken.generate(4, "1234567890abcdefghijklmnopqrstuvxyz");
    let token_code = randToken.generate(
      4,
      "1234567890abcdefghijklmnopqrstuvxyz"
    );
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

    data.trip_id = "T" + "-" + data.trip_id;
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

exports.  get_trip = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.userId);
    let getIds = await USER.find({ role: "HOTEL", created_by: req.userId });
    let pay_option = data.pay_option ? JSON.parse(data.pay_option) : []
    let search_value = data.comment ? data.comment : "";
    let ids = [];
    for (let i of getIds) {
      ids.push(i._id);
    }
    let dateFilter = data.dateFilter; // Corrected variable name
    if (!["all", "this_week", "this_month", "this_year"].includes(dateFilter)) {
      dateFilter = "all";
    }

    // Update the query based on the date filter
    let dateQuery = {};
    if (dateFilter !== "all") {
      let startDate, endDate;
      const today = new Date();
      switch (dateFilter) {
        case "this_week":
          const todayDay = today.getDay();
          startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - todayDay
          );
          endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + (6 - todayDay)
          );
          break;
        case "this_month":
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;
        case "this_year":
          startDate = new Date(today.getFullYear(), 0, 1);
          endDate = new Date(today.getFullYear(), 11, 31);
          break;
        default:
          break;
      }
      dateQuery = { createdAt: { $gte: startDate, $lte: endDate } };
    }

    const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            {
              $or: [{ created_by: { $in: objectIds } }, { created_by: mid }],
            },
            { status: true },
            { trip_status: req.params.status },
            { is_deleted: false },
            pay_option.length > 0 ? { 
              $or: pay_option.map((option) => ({
                                                 pay_option: { $regex: `^${option}$`, $options: "i" },
                                              })
                                  ), 
            } : {},
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
          is_paid:1,
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

exports.companyGetTrip = async (req, res) => {
  try {
    let data = req.body;
    let companyId = req.body.company_id;
    let companydata = await USER.findOne({ role: "COMPANY", _id: companyId });

    if (!companyId || !companydata) {

      return res.send({
        code: constant.error_code,
        message: "Invalid company",
      });
    } 
      
    let mid = new mongoose.Types.ObjectId(companyId);
    let getIds = await USER.find({ role: "HOTEL", created_by: companyId });

    let search_value = data.comment ? data.comment : "";
    let ids = [];
    for (let i of getIds) {
      ids.push(i._id);
    }
    let dateFilter = data.dateFilter; // Corrected variable name
    if (!['all', 'this_week', 'this_month', 'this_year', 'dateRange'].includes(dateFilter)) {
      dateFilter = "all";
    }

    // Update the query based on the date filter
    let dateQuery = {};
    if (dateFilter !== "all") {
      let startDate, endDate;
      const today = new Date();
      switch (dateFilter) {
        case "this_week":
          const todayDay = today.getDay();
          startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - todayDay
          );
          endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + (6 - todayDay)
          );
          break;
        case "this_month":
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;
        case "this_year":
          startDate = new Date(today.getFullYear(), 0, 1);
          endDate = new Date(today.getFullYear(), 11, 31);
          break;
        case "dateRange":
          startDate = new Date(req.body.startDate);
          endDate = new Date(req.body.endDate);

          // Modify the Date object with setHours
          
        default:
          break;
      }

      startDate.setUTCHours(0, 0, 1, 0);
      endDate.setUTCHours(23, 59, 59, 999);

      // Convert the Date objects to ISO 8601 strings
      startDate = startDate.toISOString();
      endDate = endDate.toISOString();

      dateQuery = { pickup_time: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    }

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
        message: "Unable to get the trips",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
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
        message: "Invalid driver",
      });
    } 
   
      
    driverId = new mongoose.Types.ObjectId(driverId);
    

    let search_value = data.comment ? data.comment : "";
    
    let dateFilter = data.dateFilter; // Corrected variable name
    if (!['all', 'this_week', 'this_month', 'this_year', 'dateRange'].includes(dateFilter)) {
      dateFilter = "all";
    }

    // Update the query based on the date filter
    let dateQuery = {};
    if (dateFilter !== "all") {
      let startDate, endDate;
      const today = new Date();
      switch (dateFilter) {
        case "this_week":
          const todayDay = today.getDay();
          startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - todayDay
          );
          endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + (6 - todayDay)
          );
          break;
        case "this_month":
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;
        case "this_year":
          startDate = new Date(today.getFullYear(), 0, 1);
          endDate = new Date(today.getFullYear(), 11, 31);
          break;
        case "dateRange":
          startDate = new Date(req.body.startDate);
          endDate = new Date(req.body.endDate);

          // Modify the Date object with setHours
          
        default:
          break;
      }

      startDate.setUTCHours(0, 0, 1, 0);
      endDate.setUTCHours(23, 59, 59, 999);

      // Convert the Date objects to ISO 8601 strings
      startDate = startDate.toISOString();
      endDate = endDate.toISOString();

      dateQuery = { pickup_time: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    }

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
        message: "Unable to get the trips",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
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
        message: "Invalid hotel",
      });
    } 
      
    hotelId = new mongoose.Types.ObjectId(hotelId);
    

    let search_value = data.comment ? data.comment : "";
   
    let dateFilter = data.dateFilter; // Corrected variable name
    if (!['all', 'this_week', 'this_month', 'this_year', 'dateRange'].includes(dateFilter)) {
      dateFilter = "all";
    }

    // Update the query based on the date filter
    let dateQuery = {};
    if (dateFilter !== "all") {
      let startDate, endDate;
      const today = new Date();
      switch (dateFilter) {
        case "this_week":
          const todayDay = today.getDay();
          startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - todayDay
          );
          endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + (6 - todayDay)
          );
          break;
        case "this_month":
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;
        case "this_year":
          startDate = new Date(today.getFullYear(), 0, 1);
          endDate = new Date(today.getFullYear(), 11, 31);
          break;
        case "dateRange":
          startDate = new Date(req.body.startDate);
          endDate = new Date(req.body.endDate);

          // Modify the Date object with setHours
          
        default:
          break;
      }

      startDate.setUTCHours(0, 0, 1, 0);
      endDate.setUTCHours(23, 59, 59, 999);

      // Convert the Date objects to ISO 8601 strings
      startDate = startDate.toISOString();
      endDate = endDate.toISOString();

      dateQuery = { pickup_time: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    }


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
        message: "Unable to get the trips",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
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
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_access_trip = async (req, res) => {
  try {
    if (req.user.role == "DRIVER") {
      let is_driver_has_company_access = await isDriverHasCompanyAccess(
        req.user,
        req.body.company_id
      );

      if (!is_driver_has_company_access) {
        res.send({
          code: constant.ACCESS_ERROR_CODE,
          message: "The company's access has been revoked",
        });

        return;
      }
    }

    let data = req.body;

    let check_company = USER.findById(req.body.company_id);

    if (!check_company && check_company?.is_deleted == true) {
      res.send({
        code: constant.error_code,
        message: "Invalid company",
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
      // Pagination: skip and limit
      {
        $skip: (page - 1) * limit, // Skip documents for previous pages
      },
      {
        $limit: limit, // Limit the number of documents returned
      },
    ]).sort({ createdAt: -1 });

    const getActivePaidPlans = await getCompanyActivePaidPlans(req.body.company_id)
    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to get the trips",
        activePlans: getActivePaidPlans.length > 0 ? true  : false
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
        result: get_trip,
        totalCount: totalCount,
        activePlans: getActivePaidPlans.length > 0 ? true  : false
      });
    }
  } catch (err) {
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
                        message: "No data found",
                        result : []
                      });
    }

    let filteredCompanyId = [];

    // remove the driver who doesn't have the asctive payed plan
    for (let value of companyIds) {
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
        message: "Unable to get the trips",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
        totalCount: totalCount,
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
                                { series_id: { $regex: search_value, $options: "i" } },
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
          series_id: 1,
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
        message: "Unable to get the trips",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
        totalCount :  get_trip[0]?.metadata[0]?.total | 0,
        result: results,
        
      });
    }
  } catch (err) {
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

exports.check_trip_request = async (req, res) => {
  // const uniqueNumber = await getNextSequenceValue();

  if (req.params.id !== null || req.params.id != "") {
    let beforeTwentySeconds = new Date(new Date().getTime() - 20000);
    // beforeTwentySeconds = "2024-09-16T07:46:28.408Z";
    let find_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            {
              driver_name: new mongoose.Types.ObjectId(req.params.id),
              trip_status: "Accepted",
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

        find_trip[index].left_minutes = Math.round(20 - differenceInSeconds);
        // find_trip[index].user_company_name = find_trip[index].company.company_agency.company_name;
        find_trip[index].user_company_name =
          find_trip[index].company?.company_name;
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
        message: "No trip request found",
      });
    }
  } else {
    res.send({
      code: constant.error_code,
      message: "Invalid driver",
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
                        message: "Invalid trip ID",
                      });
    }

    let driver_full_info = await DRIVER.findOne({ _id: data.driver_name });
    if (data.status != "Canceled") {

      let check_driver = await DRIVER.findOne({ _id: data.driver_name });
      if (!check_driver) {
        return res.send({
                          code: constant.error_code,
                          message: "Driver not available",
                        });
        
      }
      let newValues = {
                        $set: {
                          driver_name: check_driver._id,
                          vehicle: check_driver.defaultVehicle,
                          trip_status: data.status,
                        },
                      };

      if (check_driver._id.toString() == req?.user?.driverId?.toString()) {
        newValues = {
                      $set: {
                        driver_name: check_driver._id,
                        vehicle: check_driver.defaultVehicle,
                        trip_status: "Booked",
                      },
                    };
      }
      let option = { new: true };

      let update_trip = await TRIP.findOneAndUpdate(
        criteria,
        newValues,
        option
      );
      if (!update_trip) {
        return res.send({
                          code: constant.error_code,
                          message: "Unable to allocate the driver",
                        });

      } else {
        try {
          if ( check_driver._id.toString() != req?.user?.driverId?.toString() && data.status !== "Booked" ) {

            let driver_c_data = await USER.findOne({ _id: check_driver.created_by });

            let token_value = check_driver.deviceToken == null ? driver_c_data.deviceToken :check_driver.deviceToken;


            if (token_value) {
              await sendNotification(
                                      token_value,
                                      "New Trip is allocated have ID " + update_trip.trip_id,
                                      "New Trip is allocated have ID " + update_trip.trip_id,
                                      update_trip
                                    );

            }
          }
        } catch (error) {

          console.log( "🚀 ~ exports.alocate_driver= ~ error: Unable to send notification", error );

        }
        try {
          // to resolve the object error
          if (update_trip && typeof update_trip.toObject === "function") {
            update_trip = update_trip.toObject();
          }

          // to resolve the object error
          if (req.user && typeof req.user.toObject === "function") {
            req.user = req.user.toObject();
          }
          // req.user = req.user.toObject();
          req.user.user_company_name = "";
          req.user.user_company_phone = "";
          update_trip.user_company_name = "";
          update_trip.user_company_phone = "";

          let user_agancy_data = await AGENCY.findOne({ user_id: req.user._id, });

          // Company name a nd phone added
          if (user_agancy_data) {
            req.user.user_company_name = user_agancy_data.company_name;
            req.user.user_company_phone = user_agancy_data.phone;

            update_trip.user_company_name = user_agancy_data.company_name;
            update_trip.user_company_phone = user_agancy_data.phone;
          }

          if ( check_driver._id.toString() != req?.user?.driverId?.toString() && data.status !== "Booked" ) {
            req?.io?.to(check_driver.socketId)?.emit("newTrip", { trip: update_trip, company: req.user });
          } else {
          }
        } catch (error) {
          console.log("🚀 ~ exports.alocate_driver= ~ error:", error);
        }

        let current_date_time = new Date();
        // Update request send time in Trip
        await TRIP.updateOne(
                              { _id: req.params.id }, // Filter (find the document by _id)
                              { $set: { send_request_date_time: current_date_time } } // Update (set the new value)
                            );

        // Trip will be back in old state (Pending) if driver will not accept the trip
        setTimeout(() => { tripIsBooked(update_trip._id, driver_full_info, req.io); }, 20 * 1000);

        // Functionality for update the trips who has access of company along with company
        let created_by_company = await user_model.findById( update_trip?.created_by_company_id );

        if (created_by_company?.role == "COMPANY") {
          
          if ( created_by_company?.socketId ) {
            //  If Socket id  is exist

            req.io.to(created_by_company?.socketId).emit("refreshTrip", {
                                                                          update_trip,
                                                                          message: "A trip has been sent for allocation to the driver",
                                                                        });
          }

          // functionality For assigned driver by company
          const company_assigned_driverIds = created_by_company.company_account_access.map(  (item) => item.driver_id );

          if (company_assigned_driverIds.length > 0) {
            const drivers_info_for_socket_ids_app = await DRIVER.find({
                                                                        _id: { $in: company_assigned_driverIds },
                                                                        status: true,
                                                                        socketId: { $ne: null }, // device_token should not be null
                                                                      });

            const drivers_info_for_socket_ids_web = await DRIVER.find({
                                                                        _id: { $in: company_assigned_driverIds },
                                                                        status: true,
                                                                        webSocketId: { $ne: null }, // device_token should not be null
                                                                      });

            // getting only socet id from array
            const company_assigned_driver_sockets_web = drivers_info_for_socket_ids_web.map((item) => item.webSocketId);

            // getting only socet id from array
            const company_assigned_driver_sockets_app = drivers_info_for_socket_ids_app.map((item) => item.socketId);

            // merge the array in single array
            const driverSocketIds = company_assigned_driver_sockets_web.concat( company_assigned_driver_sockets_app );

            // Send the socket model popo to assigned drivers
            if (driverSocketIds.length > 0) {
              driverSocketIds.forEach((socketId) => {
                if (socketId != req.user.socketId) {
                  
                  req.io.to(socketId).emit("refreshTrip",
                                                          {
                                                            update_trip,
                                                            message:
                                                              "A trip has been sent for allocation to the driver. Please refresh the data",
                                                          },
                                                          (err, ack) => {
                                                            if (ack) {
                                                            } else {
                                                            }
                                                          }
                                          );
                }
              });
            }
          }

          // functionality for the drivers who have account access as partner

          const driverHasCompanyPartnerAccess = await driver_model.find({
                                                                          parnter_account_access  : {
                                                                                                      $elemMatch: { company_id: new mongoose.Types.ObjectId(created_by_company._id) },
                                                                                                    },
                                                                        });

          if (driverHasCompanyPartnerAccess){

            for (let partnerAccount of driverHasCompanyPartnerAccess) {

              // for partner app side
              if (partnerAccount?.socketId) {

                // for refresh trip
                await req.io.to(partnerAccount?.socketId).emit("refreshTrip", { message: "A trip has been sent for allocation to the driver. Please refresh the data", } )
              }
            }
          }
        }

        return res.send({
                  code: constant.success_code,
                  message: "Driver allocated successfully",
                  // data: { trip: update_trip, company: req.user },
                });
      }
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
                          message: "Unable to allocate the driver",
                        });
      } else {
        return res.send({
                          code: constant.success_code,
                          message: "Cancelled successfully",
                        });
      }
    }
  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.access_alocate_driver = async (req, res) => {
  try {
    let data = req.body;

    if (req.user.role == "DRIVER") {
      let is_driver_has_company_access = await isDriverHasCompanyAccess(
                                                                          req.user,
                                                                          req.body.company_id
                                                                        );

      if (!is_driver_has_company_access) {
        return res.send({
                          code: constant.ACCESS_ERROR_CODE,
                          message: "The company's access has been revoked",
                        });
      }
    }

    let criteria = { _id: req.params.id };
    let check_trip = await TRIP.findOne(criteria);

    if (!check_trip) {
      return res.send({
                        code: constant.error_code,
                        message: "Invalid trip ID",
                      });
      
    }

    let driver_full_info = await DRIVER.findOne({ _id: data.driver_name });

    if (data.status != "Canceled") {

      let check_driver = await DRIVER.findOne({ _id: data.driver_name });

      if (!check_driver) {
        return res.send({
                          code: constant.error_code,
                          message: "Driver not available",
                        });
        
      }

      let newValues = {
                        $set: {
                          driver_name: check_driver._id,
                          vehicle: check_driver.defaultVehicle,
                          trip_status: data.status,
                        },
                      };

      if (check_driver._id.toString() == req.userId.toString()) {
        newValues = {
                      $set: {
                        driver_name: check_driver._id,
                        vehicle: check_driver.defaultVehicle,
                        trip_status: "Booked",
                      },
                    };
      }
      let option = { new: true };

      let update_trip = await TRIP.findOneAndUpdate( criteria, newValues, option );
      if (!update_trip) {
        return res.send({
                          code: constant.error_code,
                          message: "Unable to allocate the driver",
                        });

      } else {
        try {

          if ( check_driver._id.toString() != req.userId.toString() && data.status !== "Booked" ) {

            let driver_c_data = await USER.findOne({ _id: check_driver.created_by, });

            let token_value = check_driver.deviceToken;

            if (token_value == null) {
              token_value = driver_c_data.deviceToken;
            }

            await sendNotification(
                                      token_value,
                                      "New Trip is allocated have ID " + update_trip.trip_id,
                                      "New Trip is allocated have ID " + update_trip.trip_id,
                                      update_trip
                                    );
          }
        } catch (error) {
          console.log(
            "🚀 ~ exports.alocate_driver= ~ error: Unable to send notification",
            error
          );

          //    return res.send({
          //     code: constant.success_code,
          //     message: "Driver allocated successfully"
          // })
        }
        try {
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

          // Company name a nd phone added
          if (user_agancy_data) {
            user.user_company_name = user_agancy_data.company_name;
            user.user_company_phone = user_agancy_data.phone;

            update_trip.user_company_name = user_agancy_data.company_name;
            update_trip.user_company_phone = user_agancy_data.phone;
          }

          if ( check_driver._id.toString() != req?.user?.driverId?.toString() && data.status !== "Booked" ) {

            req?.io?.to(check_driver.socketId)?.emit("newTrip", { trip: update_trip, company: user });
          }
        } catch (error) {
          console.log("🚀 ~ exports.access_alocate_driver= ~ error:", error);
        }

        let current_date_time = new Date();

        // Update request send time in Trip
        await TRIP.updateOne(
                              { _id: req.params.id }, // Filter (find the document by _id)
                              { $set: { send_request_date_time: current_date_time } } // Update (set the new value)
                            );

        setTimeout(() => { tripIsBooked(update_trip._id, driver_full_info, req.io); }, 20 * 1000);

        let created_by_company = await user_model.findById( update_trip?.created_by_company_id );

        if (created_by_company?.role == "COMPANY") {
          // Socket will not hit the function for the Driver / company who allocated the trip in this time

          if ( created_by_company?.socketId) {
            //  If Socket id  is exist

            req.io.to(created_by_company?.socketId).emit("refreshTrip", {
                                                                          update_trip,
                                                                          message: "A trip has been sent for allocation to the driver",
                                                                        });
          }

          // functionality For assigned driver by company
          const company_assigned_driverIds = created_by_company.company_account_access.map( (item) => item.driver_id );

          if (company_assigned_driverIds.length > 0) {

            const drivers_info_for_socket_ids_app = await DRIVER.find({
                                                                        _id: { $in: company_assigned_driverIds },
                                                                        status: true,
                                                                        socketId: { $ne: null }, // device_token should not be null
                                                                      });

            const drivers_info_for_socket_ids_web = await DRIVER.find({
                                                                        _id: { $in: company_assigned_driverIds },
                                                                        status: true,
                                                                        webSocketId: { $ne: null }, // device_token should not be null
                                                                      });

            // getting only socet id from array
            const company_assigned_driver_sockets_web = drivers_info_for_socket_ids_web.map((item) => item.webSocketId);

            // getting only socet id from array
            const company_assigned_driver_sockets_app = drivers_info_for_socket_ids_app.map((item) => item.socketId);

            // merge the array in single array
            const driverSocketIds = company_assigned_driver_sockets_web.concat( company_assigned_driver_sockets_app );

            // Send the socket model popup to assigned drivers
            if (driverSocketIds.length > 0) {
              driverSocketIds.forEach((socketId) => {
                if (socketId != req.user.socketId) {
                  req.io.to(socketId).emit("refreshTrip", {
                                                            update_trip,
                                                            message:
                                                              "A trip has been sent for allocation to the driver",
                                                          },
                                          (err, ack) => {
                                            if (ack) {
                                            } else {
                                            }
                                          }
                                        );
                }
              });
            }
          }

          // functionality for the drivers who have account access as partner

          const driverHasCompanyPartnerAccess = await driver_model.find({
                                                                          parnter_account_access  : {
                                                                                                      $elemMatch: { company_id: new mongoose.Types.ObjectId(created_by_company._id) },
                                                                                                    },
                                                                        });

          if (driverHasCompanyPartnerAccess){

            for (let partnerAccount of driverHasCompanyPartnerAccess) {

              // for partner app side
              if (partnerAccount?.socketId) {

                // for refresh trip
                await req.io.to(partnerAccount?.socketId).emit("refreshTrip", { message: "A trip has been sent for allocation to the driver. Please refresh the data", } )
              }
            }
          }
        }

        return res.send({
                          code: constant.success_code,
                          message: "Driver allocated successfully",
                          // data: { trip: update_trip, company: req.user }
                        });
      }
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
                          message: "Unable to allocate the driver",
                        });

      } else {
        return res.send({
                          code: constant.success_code,
                          message: "Cancelled successfully",
                        });
      }
    }
  } catch (err) {
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
          status: 1,
          trip_status: 1,
          createdAt: 1,
          updatedAt: 1,
          pay_option: 1,
          customerDetails: 1,
          passengerCount: 1,
          is_paid: 1,
          comment: 1,
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

    let getFare = await FARES.findOne({
      vehicle_type: getData[0].vehicle_type,
    });
    let fare_per_km = getFare ? Number(getFare.vehicle_fare_per_km) : 10;
    if (getData[0].price == 0) {
      getData[0].price = fare_per_km * Number(distance);
    }

    if (!getData[0]) {
      res.send({
        code: constant.error_code,
        message: "Invalid ID",
      });
    } else {
      let getUser = await AGENCY.findOne({ user_id: getData[0].created_by });
      res.send({
        code: constant.success_code,
        message: "Success",
        result: getData[0],
        hotelName: getUser ? getUser.company_name : "N/A",
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.access_get_trip_detail = async (req, res) => {
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
          status: 1,
          trip_status: 1,
          createdAt: 1,
          updatedAt: 1,
          pay_option: 1,
          customerDetails: 1,
          passengerCount: 1,
          is_paid: 1,
          comment: 1,
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

    let getFare = await FARES.findOne({
      vehicle_type: getData[0].vehicle_type,
    });
    let fare_per_km = getFare ? Number(getFare.vehicle_fare_per_km) : 10;
    if (getData[0].price == 0) {
      getData[0].price = fare_per_km * Number(distance);
    }

    if (!getData[0]) {
      res.send({
        code: constant.error_code,
        message: "Invalid ID",
      });
    } else {
      let getUser = await AGENCY.findOne({ user_id: getData[0].created_by });
      res.send({
        code: constant.success_code,
        message: "Success",
        result: getData[0],
        hotelName: getUser ? getUser.company_name : "N/A",
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

    data.trip_id = "T" + "-" + data.trip_id;

    let checkCompanyId = await AGENCY.findOne({ company_id: data.company_id });
    if (!checkCompanyId) {
      res.send({
        code: constant.error_code,
        message: "Invalid company ID",
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
    let getFare = await FARES.findOne({ vehicle_type: data.vehicle_type });
    let fare_per_km = getFare
      ? Number(getFare.vehicle_fare_per_km ? getFare.vehicle_fare_per_km : 12)
      : 10;
    if (!data.price) {
      data.price = (fare_per_km * Number(distance)).toFixed(2);
    }

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
                                            <img style="width: 40%;" src="https://idispatch.nl/static/media/taxi-logo.561c5ba100d503dd91d6.png" />
                                        </td>
                                      </tr>
                                      <tr class="">
                                        <td class="headline">
                                          Greeting from iDispatch!
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
                                                    Greeting from iDispatch! Your booking
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
                                              href="https://idispatch.nl/login"
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
                                          <p>
                                            The password was auto-generated, however feel
                                            free to change it
            
                                            <a href="" style="text-decoration: underline">
                                              here</a
                                            >
                                          </p>
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
        body: "Your booking has been created",
      });
    }

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

exports.check_company_id = async (req, res) => {
  try {
    let checkCompanyId = await AGENCY.findOne({
      company_id: req.params.company_id,
    });
    if (!checkCompanyId) {
      res.send({
        code: constant.error_code,
        message: "Invalid company ID",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
        result: checkCompanyId,
      });
    }
  } catch (err) {
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
