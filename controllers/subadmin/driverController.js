const constant = require("../../config/constant");
const DRIVER = require("../../models/user/driver_model"); // Import the Driver model
const AGENCY = require("../../models/user/agency_model");
const USER = require("../../models/user/user_model"); // Import the Driver model
const TRIP = require("../../models/user/trip_model"); // Import the Driver model
const bcrypt = require("bcrypt");
const multer = require("multer");
const randToken = require("rand-token").generator();
const path = require("path");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const { getUserActivePaidPlans } = require("../../Service/helperFuntion");
// var driverStorage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, path.join(__dirname, '../../uploads/driver'))
//
//     },
//     filename: function (req, file, cb) {
//
//         cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
//     }
// })

// var driverUpload = multer({
//     storage: driverStorage
// }).single("driver_image")

const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../../config/cloudinary");
const { get } = require("../../routes/admin");
const trip_model = require("../../models/user/trip_model");
const imageStorage = require("../../config/awss3");

// const imageStorage = new CloudinaryStorage({
//     cloudinary: cloudinary,
//     params: {
//         folder: "TaxiBooking",
//         // allowedFormats: ["jpg", "jpeg", "png"],
//         public_id: (req, file) =>
//             `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
//         // format: async (req, file) => "jpg", // Convert all uploaded images to JPEG format
//         // transformation: [{ width: 500, height: 500, crop: "limit" }],
//         maxFileSize: 10000000,
//     },
// });

var driverUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
}).single("driver_image");

exports.add_driver = async (req, res) => {
  driverUpload(req, res, async (err) => {
    try {
      const data = req.body;

      let hash = await bcrypt.hashSync(
        data.password ? data.password : "Test@123",
        10
      );
      data.password = hash;
      data.created_by = req.userId; // Assuming you have user authentication
      data.agency_user_id = req.userId; // Assuming you have user authentication
      data.profile_image = req.file
        ? req.file.path
        : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg";

      let save_driver = await DRIVER(data).save();
      if (!save_driver) {
        res.send({
          code: constant.error_code,
          message: "Unable to save the data",
        });
      } else {
        res.send({
          code: constant.success_code,
          message: "Driver created successfully",
          result: save_driver,
        });
      }
    } catch (err) {
      res.send({
        code: constant.error_code,
        message: err.message,
      });
    }
  });
};

exports.remove_driver = async (req, res) => {
  try {
    const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

    // You may want to add additional checks to ensure the driver exists or belongs to the agency user
    const removedDriver = await DRIVER.findById(driverId);

    if (removedDriver) {
      removedDriver.is_deleted = true;
      removedDriver.save();
      res.send({
        code: constant.success_code,
        message: "Driver deleted successfully",
        result: removedDriver,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: "Driver not found",
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_driver_detail = async (req, res) => {
  try {
    const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

    const driver = await DRIVER.findOne({
                                          $and: [
                                            {
                                              $or: [{ _id: req.userId }],
                                            },
                                            { is_deleted: false },
                                          ],
                                        });
    if (!driver) {
      res.send({
        code: constant.error_code,
        message: "Unable to fetch the detail",
      });
    } else {
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      );
      const completedTrips = await trip_model.find({
                                                    driver_name: req.userId,
                                                    trip_status: "Completed",
                                                    is_paid: true,
                                                  })
                                                  .countDocuments();

      const totalActiveTrips = await trip_model.find({
                                                      driver_name: req.userId,
                                                      trip_status: "Active",
                                                    })
                                                    .countDocuments();

      const totalUnpaidTrips = await trip_model.find({
                                                      driver_name: req.userId,
                                                      trip_status: "Completed",
                                                      is_paid: false,
                                                      drop_time: {
                                                        $lte: startOfCurrentWeek,
                                                      },
                                                    })
                                                    .countDocuments();

      const totalReachedTrip = await trip_model.find({
                                                      driver_name: req.userId,
                                                      trip_status: "Reached",
                                                      is_paid: false,
                                                    })
                                                    .countDocuments();

      
     

      const result = driver.toObject();

      if (result?.driver_company_id) {
        const companyDetail = await USER.findById(result?.driver_company_id);
        result.companyDetail = companyDetail
      }
      
      result.totalTrips = completedTrips;
      const partnerCompanyAccess = await result.parnter_account_access.map((data) =>  new mongoose.Types.ObjectId(data?.company_id?.toString()));
      
      result.partnerCompanyAccess =  partnerCompanyAccess ? await AGENCY.find({user_id: { $in: partnerCompanyAccess }}) : []
      const driverPurchasedPlans = await getUserActivePaidPlans(req.user);
      result.plan_access_status = driverPurchasedPlans.length > 0 ? true : false;

      res.send({
        code: constant.success_code,
        message: "Success",
        partner_access: partnerCompanyAccess,
        result,
        totalActiveTrips,
        totalUnpaidTrips,
        totalReachedTrip,
      });
    }
    // if (driver && driver.is_deleted === false) {
    //     res.send({
    //         code: constant.success_code,
    //         message: 'Driver deleted successfully',
    //         result: driver,
    //     })
    // } else {
    //     res.send({
    //         code: constant.error_code,
    //         message: 'Driver not found',
    //     });
    // }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_drivers = async (req, res) => {
  try {
    const agencyUserId = req.userId; // Assuming you have user authentication and user ID in the request

    const drivers = await DRIVER.find({ is_deleted: false }).sort({
      createdAt: -1,
    });

    if (drivers) {
      res.send({
        code: constant.success_code,
        message: "Driver list retrieved successfully",
        result: drivers,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: "No drivers found for the agency user",
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.update_driver = async (req, res) => {
  driverUpload(req, res, async (err) => {
    try {
      const driverId = req.userId; // Assuming you pass the driver ID as a URL parameter
      const updates = req.body; // Assuming you send the updated driver data in the request body

      // Check if the driver exists
      const existingDriver = await DRIVER.findOne({ _id: driverId });

      if (!existingDriver || existingDriver.is_deleted) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('updateDriver.error.driverNotFound'),
                        });
      }

      const isDriverOnRide = await TRIP.findOne({driver_name: driverId , trip_status: { $in: [ constant.TRIP_STATUS.REACHED , constant.TRIP_STATUS.ACTIVE] } });

      // If driver is on ride then he cant be  offline
      if (isDriverOnRide && updates?.status == "false") {

        return res.send({
                          code: constant.error_code,
                          message: res.__('updateDriver.error.cannotGoOfflineWithActiveTrip')
                        });
      }

      updates.profile_image = req.file ? req.file.filename : existingDriver.profile_image;

      const updatedDriver = await DRIVER.findOneAndUpdate( { _id: driverId }, updates, { new: true } );

      if (updatedDriver) {
        return res.send({
                          code: constant.success_code,
                          message: res.__('updateDriver.success.driverAccountUpdated'),
                          result: updatedDriver,
                        });
      }
    } catch (err) {
      return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
    }
  });
};

exports.reset_password = async (req, res) => {
  try {
    let data = req.body;
    let check_id = await DRIVER.findOne({ _id: req.userId });
    if (!check_id) {
      res.send({
        code: constant.success_code,
        message: "Invalid ID",
      });
      return;
    }
    let check_password = await bcrypt.compare(
      data.oldPassword,
      check_id.password
    );
    if (!check_password) {
      res.send({
        code: constant.error_code,
        message: "Old password is not correct",
      });
    } else {
      let values = {
        $set: {
          password: bcrypt.hashSync(data.password, 10),
          stored_password: data.password
        },
      };
      let updateData = await DRIVER.findOneAndUpdate(
        { _id: check_id._id },
        values,
        { new: true }
      );
      if (!updateData) {
        res.send({
          code: constant.error_code,
          message: "Unable to update the password",
        });
      } else {
        res.send({
          code: constant.success_code,
          message: "Updated successfully",
          checking: updateData.password,
        });
      }
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_trips_for_driver = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.userId);
    // let getIds = await USER.find({ role: 'HOTEL', created_by: req.userId })

    // let search_value = data.comment ? data.comment : ''
    // let ids = []
    // for (let i of getIds) {
    //     ids.push(i._id)
    // }
    // const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    let search_value = data.comment ? data.comment : "";

    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { driver_name: mid },
            { status: true },
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
              $lookup: {
                from: "agencies",
                localField: "created_by",
                foreignField: "user_id",
                as: "company_agency",
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "created_by",
                foreignField: "_id",
                as: "company_user",
              },
            },
            {
              $unwind: {
                path: "$agency",
              },
            },
            {
              $unwind: {
                path: "$company_agency",
              },
            },
            {
              $unwind: {
                path: "$company_user",
              },
            },
            // {
            //     $project: {
            //         'company_name': { $arrayElemAt: ["$agency.company_name", 0] },
            //         'cvompany_name': { $arrayElemAt: ["$agency.phone", 0] },
            //     }
            // }
          ],
        },
      },
      {
        $unwind: {
          path: "$userData",
        },
      },
      {
        $project: {
          _id: 1,
          // userData: 1,
          customer_phone: "$userData.phone",
          trip_from: 1,
          trip_to: 1,
          is_paid: 1,
          pickup_date_time: 1,
          trip_status: 1,
          price: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          customerDetails: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          company_name: "$userData.agency.company_name",
          user_company_name: "$userData.company_agency.company_name",
          user_company_phone: "$userData.company_user.phone",
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
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      );
      const totalActiveTrips = await TRIP.find({
        driver_name: req.userId,
        trip_status: "Active",
      }).countDocuments();
      const totalUnpaidTrips = await TRIP.find({
        driver_name: req.userId,
        trip_status: "Completed",
        is_paid: false,
        drop_time: {
          $lte: startOfCurrentWeek,
        },
      }).countDocuments();

      const totalReachedTrip = await TRIP.find({
        driver_name: req.userId,
        trip_status: "Reached",
        is_paid: false,
      }).countDocuments();

      res.send({
        code: constant.success_code,
        message: "Success",
        result: get_trip,
        totalActiveTrips,
        totalUnpaidTrips,
        totalReachedTrip,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_trips_for_drivers = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.userId);
    // let getIds = await USER.find({ role: 'HOTEL', created_by: req.userId })

    // let search_value = data.comment ? data.comment : ''
    // let ids = []
    // for (let i of getIds) {
    //     ids.push(i._id)
    // }
    // const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    let search_value = data.comment ? data.comment : "";

    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { driver_name: mid },
            { status: true },
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
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
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
          from: "users",
          localField: "created_by_company_id",
          foreignField: "_id",
          as: "companyData",
        },
      },
      {
        $unwind: {
          path: "$userData",
        },
      },
      {
        $project: {
          _id: 1,
          // userData: 1,
          customer_phone: "$userData.p_number",
          company_phone:{ $arrayElemAt: ["$companyData.phone", 0] },
          trip_from: 1,
          trip_to: 1,
          is_paid: 1,
          pickup_date_time: 1,
          trip_status: 1,
          price: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          customerDetails: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          company_name: "$userData.company_name",
          user_company_name: "$userData.company_name",
          user_company_phone: "$userData.phone",
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
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
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      );
      const totalActiveTrips = await TRIP.find({
        driver_name: req.userId,
        trip_status: "Active",
      }).countDocuments();
      const totalUnpaidTrips = await TRIP.find({
        driver_name: req.userId,
        trip_status: "Completed",
        is_paid: false,
        drop_time: {
          $lte: startOfCurrentWeek,
        },
      }).countDocuments();

      const totalReachedTrip = await TRIP.find({
        driver_name: req.userId,
        trip_status: "Reached",
        is_paid: false,
      }).countDocuments();

      res.send({
        code: constant.success_code,
        message: "Success",
        result: get_trip,
        totalActiveTrips,
        totalUnpaidTrips,
        totalReachedTrip,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getAllTripsForDrivers = async (req, res) => {
  try {

    let data = req.body;
    let id = new mongoose.Types.ObjectId(req.userId);
    
    const page = parseInt(req.query.page) || 1; // Default to page 1 if not provided
    const limit = parseInt(req.query.limit) || 10; // Default to 10 items per page if not provided
    let   criteria =  {
                        status: true,
                        trip_status: req.params.status,
                        is_deleted: false,
                      };

    if (req.user.role == constant.ROLES.COMPANY) {

      criteria.created_by_company_id =  id;

    } else if (req.user.role == constant.ROLES.DRIVER ) {

      criteria.driver_name = id;
    }

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
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
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
          from: "users",
          localField: "created_by_company_id",
          foreignField: "_id",
          as: "companyData",
        },
      },
      {
        $unwind: {
          path: "$userData",
        },
      },
      {
        $project: {
          _id: 1,
          // userData: 1,
          customer_phone: "$userData.p_number",
          company_phone:{ $arrayElemAt: ["$companyData.phone", 0] },
          trip_from: 1,
          trip_to: 1,
          is_paid: 1,
          passengerCount:1,
          pickup_date_time: 1,
          trip_status: 1,
          price: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          customerDetails: 1,
          payment_method_price:1,
          child_seat_price:1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          navigation_mode:1,
          company_name: "$userData.company_name",
          user_company_name: "$userData.company_name",
          user_company_phone: "$userData.phone",
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
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
      // Pagination: skip and limit
      {
        $skip: (page - 1) * limit, // Skip documents for previous pages
      },
      {
        $limit: limit, // Limit the number of documents returned
      },
    ]).sort({ createdAt: -1 });

    const getActivePaidPlans = await getUserActivePaidPlans(req.user)
    
    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: "Unable to get the trips",
        activePlans: getActivePaidPlans.length > 0 ? true  : false
      });
    } else {


      // For driver only
      
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate( startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay());

      const totalActiveTrips = await  TRIP.find({
                                                  driver_name: id,
                                                  trip_status: "Active",
                                                })
                                          .countDocuments();

      const totalUnpaidTrips = await TRIP.find({
                                                driver_name: id,
                                                trip_status: "Completed",
                                                is_paid: false,
                                                drop_time: {
                                                  $lte: startOfCurrentWeek,
                                                },
                                              })
                                          .countDocuments();

      const totalReachedTrip = await TRIP.find({
                                                driver_name: id,
                                                trip_status: "Reached",
                                                is_paid: false,
                                                under_cancellation_review: false
                                              })
                                          .countDocuments();
      const underCancellationReview = await TRIP.find({
                                                driver_name: id,
                                                under_cancellation_review: true,
                                              });



      return res.send({
                        code: constant.success_code,
                        message: "Success",
                        activePlans: getActivePaidPlans.length > 0 ? true  : false,
                        totalCount: totalCount,
                        result: get_trip,
                        totalActiveTrips,
                        totalUnpaidTrips,
                        totalReachedTrip,
                        totalUndercancellationReview: underCancellationReview.length,
                        totalUndercancellationTrip: underCancellationReview,
                      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getTripsCountForDrivers = async (req, res) => {

  try {

    let id = new mongoose.Types.ObjectId(req.userId);

    let criteria = {};

    if (req.user.role == constant.ROLES.COMPANY) {

      criteria =  {
                    created_by_company_id: id,
                    status: true,
                    trip_status: req.params.status,
                    is_deleted: false
                  }
    } else if (req.user.role == constant.ROLES.DRIVER ) {

      criteria =  {
                    driver_name: id,
                    status: true,
                    trip_status: req.params.status,
                    is_deleted: false
                  }
    }


    let get_trip =  await TRIP.countDocuments(criteria);
    
    return res.send({
                      code: constant.success_code,
                      count: get_trip,
                    });

  } catch (err) {
    console.log('getTripsCountForDrivers--~~')
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.getUnderTripCancelledTripsCountForDrivers = async (req, res) => {

  try {

    let id = new mongoose.Types.ObjectId(req.userId);

    let criteria =  {
                    created_by_company_id: id,
                    status: true,
                    under_cancellation_review: true,
                    is_deleted: false
                  }
   


    let get_trip =  await TRIP.countDocuments(criteria);
    
    return res.send({
                      code: constant.success_code,
                      count: get_trip,
                    });

  } catch (err) {
    console.log('getTripsCountForDrivers--~~')
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.login = async (req, res) => {
  try {
    let data = req.body;
    let check_phone = await DRIVER.findOne({ email: data.email });

    if (!check_phone) {
      res.send({
        code: constant.error_code,
        message: "Invalid Credentials",
      });
      return;
    }
    let check_password = await bcrypt.compare(
      data.password,
      check_phone.password
    );

    if (!check_password) {
      res.send({
        code: constant.error_code,
        message: "Invalid Credentials",
      });
    } else {
      let jwtToken = jwt.sign(
        { userId: check_phone._id },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      let updateData = await DRIVER.findOneAndUpdate(
        { _id: check_phone._id },
        { OTP: "A0", jwtToken: jwtToken },
        { new: true }
      );
      res.send({
        code: constant.success_code,
        message: "Login Successfully",
        result: updateData,
        jwtToken: jwtToken,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.verify_otp = async (req, res) => {
  try {
    let data = req.body;
    let check_id = await DRIVER.findOne({ _id: data.driverId });
    if (!check_id) {
      res.send({
        code: constant.error_code,
        message: "Something went wrong, please try again",
      });
    } else {
      let jwtToken = jwt.sign({ userId: check_id._id }, process.env.JWTSECRET, {
        expiresIn: "365d",
      });
      let updateData = await DRIVER.findOneAndUpdate(
        { _id: check_id._id },
        { OTP: "A0", jwtToken: jwtToken },
        { new: true }
      );
      if (!updateData) {
        res.send({
          code: constant.error_code,
          message: "Unable to process the request",
        });
      } else {
        res.send({
          code: constant.success_code,
          message: "Login Successfully",
          result: updateData,
        });
      }
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_reports = async (req, res) => {
  try {
    let data = req.body;
    let query;
    if (data.filter_type == "all") {
      query = [
        { status: true },
        { is_paid: true },
        { trip_status: "Completed" },

        { driver_name: new mongoose.Types.ObjectId(req.userId) },
      ];
    } else {
      query = [
        { status: true },
        { is_paid: true },
        { trip_status: "Completed" },
        { driver_name: new mongoose.Types.ObjectId(req.userId) },
        {
          pickup_date_time: {
            $gte: new Date(data.from_date),
            $lt: new Date(data.to_date),
          },
        },
      ];
    }

    let get_data = await TRIP.find({
      $and: query,
    });
    const totalPrice = get_data.reduce((sum, obj) => {
      let commission = obj?.commission?.commission_value || 0;
      if (obj?.commission?.commission_type === "Percentage") {
        commission = (obj.price / 100) * obj.commission.commission_value;
      }
      return sum + obj.price - commission;
    }, 0);
    if (!get_data) {
      res.send({
        code: constant.error_code,
        message: "Unable to fetch the details",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
        result: {
          trips: get_data.length,
          earning: totalPrice,
          get_data,
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

exports.company_access_list = async (req, res) => {
  try {
    const companyIds = req.user.company_account_access.map(
      (access) => access.company_id
    );
    // const company_access_list = await USER.find({ _id: { $in: companyIds } });

    const company_access_list = await USER.aggregate([
      {
        $match: {
          $and: [{ _id: { $in: companyIds } }],
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "company_data",
        },
      },
      {
        $unwind: {
          path: "$company_data",
        },
      },

      {
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          phone: "$company_data.p_number",
          company_name: "$company_data.company_name",
          address_1: "$company_data.land",
        },
      },
    ]);

    if (company_access_list.length > 0) {
      res.send({
        code: constant.success_code,
        data: company_access_list,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: "You dont have any access",
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.favoriteDriver = async (req, res) => {
  try {
    const driverId = new mongoose.Types.ObjectId(req.params.id);
    const driver = await DRIVER.findById(driverId);
    if (!driver) {
      return res.send({
                        code: constant.error_code,
                        message: "Driver not found",
                      });
    }

    const user = req.user;
    const isFavorite = user.favoriteDrivers.some(id => id.equals(driverId)); // Check if driver is already in the favorites

    if (!isFavorite) {

      // Add driver to the user's favorite list
      user.favoriteDrivers.push(driverId);
      // await user.save();
      await DRIVER.updateOne( { _id: user._id },  { $set: {favoriteDrivers: user.favoriteDrivers} }  );
      return res.send({
        code: constant.success_code,
        message: "Driver added successfully to favorite drivers",
      });
    } else {
      user.favoriteDrivers = user.favoriteDrivers.filter(id => !id.equals( driverId ));
      await DRIVER.updateOne( { _id: user._id },  { $set: {favoriteDrivers: user.favoriteDrivers} }  );
      return res.send({
        code: constant.success_code,
        message: "Driver removed successfully from favorite driver",
      });
    }
  } catch (err) {
    return res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getDriverList = async (req, res) => {
  let api_start_time = new Date();

  try {
    const agencyUserId = req.userId; // Assuming you have user authentication and user ID in the request
    let getDetail = await DRIVER.findOne({ _id: req.userId });

    const search = req.query.search || "";
    const query = { is_deleted: false, };
    if (search.length > 0) {
      query.$or = [
                    { email: { $regex: search, $options: "i" } },
                    { phone: { $regex: search, $options: "i" } },
                    { first_name: { $regex: search, $options: "i" } },
                    { last_name: { $regex: search, $options: "i" } },
                    { address_1: { $regex: search, $options: "i" } },
                    { nickName: { $regex: search, $options: "i" } },
                  ];
    }

    const driver = await DRIVER.find(query, {
                                              _id: 1,
                                              profile_image: 1,
                                              first_name: 1,
                                              last_name: 1,
                                              phone: 1,
                                              status: 1,
                                              is_login: 1,
                                              nickName:1,
                                              isVerified: 1,
                                            }
                                    );
                                    
    if (driver) {
      const favorite_driver = getDetail?.favoriteDrivers ? getDetail.favoriteDrivers.map((id) => id.toString()) : [];

      const result = driver.map((d) => {
                                        const driverObj = d.toObject();
                                        let isFavorite = false;
                                        if (favorite_driver.includes(driverObj._id.toString())) { isFavorite = true; }
                                        driverObj.isFavorite = isFavorite;
                                        return driverObj;
                                      }
                                );

      // Sort so that items with isFavorite: true come first

      if (result.length > 0) {
        result.sort((a, b) => b.isFavorite - a.isFavorite);
      }
      
      return res.send({
                        code: constant.success_code,
                        message: "Driver list retrieved successfully",
                        result: result,
                      });
    } else {
      return res.send({
                        code: constant.error_code,
                        message: "No drivers found for the agency user",
                      });
    }
  } catch (err) {
    console.log("🚀 ~ exports.get_driver= ~ err:", err);

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};