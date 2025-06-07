require("dotenv").config();
const constant = require("../../config/constant");
const DRIVER = require("../../models/user/driver_model"); // Import the Driver model
const USER = require("../../models/user/user_model"); // Import the Driver model
const LOGS = require("../../models/user/logs_model"); // Import the Driver model
const TRIP = require("../../models/user/trip_model"); // Import the Driver model
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const randToken = require("rand-token").generator();
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { sendEmailDriverCreation , getUserActivePaidPlans  , sendAccountDeactivationEmail , sendAccountReactivationEmail} = require("../../Service/helperFuntion");
const { getDriverNextSequenceValue } = require("../../models/user/driver_counter_model");
// var driverStorage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, path.join(__dirname, '../../uploads/driver'))
//         console.log('file_-------------',file)
//     },
//     filename: function (req, file, cb) {
//         console.log("file+++++++++++++++++++++++=", file)
//         cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
//     }
// })

// var driverUpload = multer({
//     storage: driverStorage
// }).single("driver_image")
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../../config/cloudinary");
const emailConstant = require("../../config/emailConstant");
const trip_model = require("../../models/user/trip_model");
const user_model = require("../../models/user/user_model");
const imageStorage = require("../../config/awss3");
const aws = require("aws-sdk");
const multerS3 = require("multer-s3");

// const imageStorage = new CloudinaryStorage({
//   cloudinary: cloudinary,
//   params: {
//     folder: "TaxiBooking",
//     // allowedFormats: ["jpg", "jpeg", "png"],
//     public_id: (req, files) =>
//       `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
//     // format: async (req, file) => "jpg", // Convert all uploaded images to JPEG format
//     // transformation: [{ width: 500, height: 500, crop: "limit" }],
//     maxFileSize: 10000000,
//   },
// });

var driverUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
}).any([{ name: "driver_image" }, { name: "driver_documents" }]);

exports.add_driver = async (req, res) => {
  // driverUpload(req, res, async (err) => {
  try {
    const data = req.body;
    data.email = data?.email?.toLowerCase();
    var driver_image = [];
    var driver_documents = [];
    // var imagePortfolioLogo = []
    // let file = req.files
    // for (i = 0; i < file.length; i++) {
    //     if (file[i].fieldname == 'driver_image') {
    //         driver_image.push(file[i].path);
    //     } else if (file[i].fieldname == 'driver_documents') {
    //         driver_documents.push(file[i].path);

    //     }
    // }
    const stored_password = data.password;
    data.stored_password = stored_password;
    let hash = await bcrypt.hashSync(data.password, 10);
    data.password = hash;
    // data.profile_image = driver_image?.length != 0 ? driver_image[0] : 'https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg'
    // data.driver_documents = driver_documents?.length != 0 ? driver_documents[0] : 'https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg'
    // let check_other = await USER.findOne({ email: data.email })
    // if (check_other) {
    //     res.send({
    //         code: constant.error_code,
    //         message: "Email Already exist"
    //     })
    //     return
    // }
    const superAdmin = await user_model.findOne({ role: "SUPER_ADMIN" });
    data.lastUsedToken = new Date();
    data.created_by = superAdmin; // Assuming you have user authentication
    let check_other1 = await DRIVER.findOne({ email: { $regex: data.email, $options: "i" }, is_deleted: false, });

    let checkNickName = await DRIVER.findOne({ nickName: data.nickName});
    let check_other2 = await DRIVER.findOne({ phone: data.phone, is_deleted: false, });
    let check_other3 = await user_model.findOne({ email: { $regex: data.email, $options: "i" }, is_deleted: false, });
    let check_other4 = await user_model.findOne({ phone: data.phone, is_deleted: false, });

    if (checkNickName) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.nicknameAlreadyInUse'),
                      });
    }
    if (check_other1) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.emailAlreadyInUse'),
                      });
      
    }
    if (check_other2) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.phoneAlreadyInUse'),
                      });
      
    }
    if (check_other3) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.emailRegisteredAsCompany')
                      });
      
    }
    if (check_other4) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.phoneRegisteredAsCompany')
                      });
      
    }

    // Create or get stripe customer id
    let customer = await stripe.customers.list({ email: data.email });
    customer = customer.data.length ? customer.data[0] : await stripe.customers.create({ email: data.email });
    
    data.stripeCustomerId = customer.id;
    data.driverCounterId = `D-`+ await getDriverNextSequenceValue();

    let save_driver = await DRIVER(data).save();
    let jwtToken = jwt.sign({ userId: save_driver._id },  process.env.JWTSECRET, { expiresIn: "365d" } );

    save_driver.jwtTokenMobile = jwtToken;
    save_driver.lastUsedTokenMobile = new Date();

    save_driver.jwtToken = jwtToken;

    
    save_driver.lastUsedToken = new Date();

    await save_driver.save();

    if (!save_driver) {
      return res.send({
                      code: constant.error_code,
                      message: res.__('addDriver.error.saveFailed')
                    });
    } else {
      // mail
      let sendEmail = await sendEmailDriverCreation(save_driver , null);
      return res.send({
                        code: constant.success_code,
                        message: res.__('addDriver.success.driverCreated'),
                        result: save_driver,
                        jwtToken,
                      });
    }
  } catch (err) {
    console.log("🚀 ~ driverUpload ~ err:", err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
  // })
};

const generate6DigitPassword = async () => {

  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const length = 6;
  let password = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    password += characters[randomIndex];
  }

  return password;
}

exports.adminAddDriver = async (req, res) => {
  driverUpload(req, res, async (err) => {
  try {
    const data = req.body;

    data.email = data?.email?.toLowerCase();
    data.isDocUploaded = false;
    data.isVerified = true;

    var driver_image = [];
    var driver_documents = [];
    var imagePortfolioLogo = []
    let file = req.files
    for (i = 0; i < file.length; i++) {
        if (file[i].fieldname == 'driver_image') {
            driver_image.push(file[i].location);
            data.profile_image = file[i].location;
        } else if (file[i].fieldname == 'driver_documents') {
            driver_documents.push(file[i].location);
            data.driver_documents = file[i].location;
            data.isDocUploaded = true;
        }
    }

    // const randomPasword = await generate6DigitPassword()
    // data.stored_password = randomPasword;
    // let hash = await bcrypt.hashSync(randomPasword, 10);
    // data.password = hash;


    // data.profile_image = driver_image?.length != 0 ? driver_image[0] : 'https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg'
    // data.driver_documents = driver_documents?.length != 0 ? driver_documents[0] : 'https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg'
    
    const superAdmin = await user_model.findOne({ role: "SUPER_ADMIN" });
    
    data.created_by = superAdmin; // Assuming you have user authentication

    let checkEmailInDrivers = await DRIVER.findOne({email: { $regex: data.email, $options: "i" },
      // is_deleted: false,
    });

    if (checkEmailInDrivers) {

      if (checkEmailInDrivers.is_deleted == true) {
        return  res.send({
                          code: constant.error_code,
                          message: res.__('addDriver.error.emailAssociatedWithDeletedDriver' , {email: data.email}),
                        });
      } else {
        return  res.send({
                            code: constant.error_code,
                            message: res.__('addDriver.error.emailAlreadyInUse')
                        });
      }
    }

    

    let checkEmailInUsers = await USER.findOne({ 
                                                email: { $regex: data.email, $options: "i" },
                                                ...(data?.isCompany == 'true' ? { _id: { $ne: new mongoose.Types.ObjectId(data?.driver_company_id) } } : {}), 
                                              })
    
    let checkPhoneInDriver = await DRIVER.findOne({
                                                    phone: data.phone,
                                                    // is_deleted: false,
                                                  });
    
    let checkPhoneInUsers = await user_model.findOne({
                                                      phone: data.phone,
                                                      // is_deleted: false,
                                                      ...(data?.isCompany == 'true' ? { _id: { $ne: new mongoose.Types.ObjectId(data?.driver_company_id) } } : {}),
                                                    });
    
    let checkNickName = await DRIVER.findOne({ nickName: data.nickName});

    
                                                    
    if (checkEmailInDrivers) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.emailAlreadyInUse'),
                      });
      
    }
    if (checkPhoneInDriver) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.phoneAlreadyInUse'),
                      });
    }

    if (checkEmailInUsers) {

      return res.send({
                      code: constant.error_code,
                      message: res.__('addDriver.error.emailRegisteredAsCompany')
                    });
    }

    if (checkPhoneInUsers) {

      return res.send({
                      code: constant.error_code,
                      message: res.__('addDriver.error.phoneRegisteredAsCompany')
                    });
      
    }

    if (checkNickName) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.nickNameAlreadyInUse')
                      });
    }

   
    let isCompanyAlreadyDriver;

    if (data?.isCompany == 'true') {

      isCompanyAlreadyDriver = await USER.findOne({ _id: new mongoose.Types.ObjectId(data?.driver_company_id)});
    
      // If company already has his driver
      if ( isCompanyAlreadyDriver && isCompanyAlreadyDriver.driverId != null) { 

        return res.send({
                          code: constant.error_code,
                          message: res.__('addDriver.error.companyHasOwnDriver'),
                        });
      }

      const companyInfo = await USER.aggregate([
                                                {
                                                  $lookup: {
                                                    from: "agencies", 
                                                    localField: "_id", 
                                                    foreignField: "user_id", 
                                                    as: "agency_data",
                                                  },
                                                },
                                                {
                                                  $match: {
                                                    _id: new mongoose.Types.ObjectId(data?.driver_company_id),
                                                  },
                                                },
                                                {
                                                  $project: {
                                                    name: 1, // Include driver name
                                                    user_info: "$$ROOT",
                                                    companyDetails: { $arrayElemAt: ["$agency_data", 0] }, // Include the first matching company
                                                  },
                                                },
                                              ]);
      
      data.company_agency_id = companyInfo ? companyInfo[0].companyDetails._id : null;
    } else {

      delete data.company_agency_id;
      delete data.driver_company_id;
    }

    let randomPasword = randToken.generate( 8, "1234567890abcdefghijklmnopqrstuvxyz" );

    // add company's password into driver password so same login will work for both role
    randomPasword = data?.isCompany == 'true' ? isCompanyAlreadyDriver?.stored_password : randomPasword; 
    data.stored_password = randomPasword;
    let hashedPassword = await bcrypt.hashSync(randomPasword, 10);
    data.password = hashedPassword;

    
    // Create or get stripe customer id
    // let customer = await stripe.customers.list({ email: data.email });
    // customer = customer.data.length ? customer.data[0] : await stripe.customers.create({ email: data.email });
    let customer = await stripe.customers.list({ email: data.email });
    const userFormattedAddress = `${data?.address_1} ${data?.address_2} , ${data?.post_code}`;
    const stripeUserData = { 
                                                  name: data?.companyName,
                                                  email: data.email,
                                                  address: {
                                                            line1: userFormattedAddress,
                                                            postal_code: data?.post_code,
                                                            city: data?.city,
                                                            country: data?.country
                                                          }, 
                                                          metadata: {
                                                                      person_name: `${data?.first_name} ${data?.last_name}`
                                                                    }
                                                }
    // const getAddressData = await getCityAndCountry(userFormattedAddress);
    // const city = getAddressData?.city ? getAddressData?.city : '';
    // const country = getAddressData?.city ? getAddressData?.country : '';
    
    if (customer.data.length) {
      
      customer =  customer.data[0]
      await stripe.customers.update(customer.id, stripeUserData);
    } else {
      customer = await stripe.customers.create(stripeUserData)
    }
    data.stripeCustomerId = customer.id;
    data.driverCounterId = `D-`+ await getDriverNextSequenceValue();
    
    
    let save_driver = await DRIVER(data).save();
   

    if (!save_driver) {
      res.send({
        code: constant.error_code,
        message: res.__('addDriver.error.saveFailed'),
      });
    } else {
      // mail

      await sendEmailDriverCreation(save_driver , randomPasword)
     
      if (data?.isCompany == 'true') {
        await USER.updateOne( 
                                { _id: new mongoose.Types.ObjectId(data?.driver_company_id) },
                                { $set: { driverId: save_driver._id , isDriver: true} }
                              );
      }
      res.send({
        code: constant.success_code,
        message: res.__('addDriver.success.driverCreated'),
        result: save_driver
      });
    }
  } catch (err) {
    console.log("🚀 ~ driverUpload ~ err:", err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
  })
};

exports.remove_driver = async (req, res) => {
  try {
    const driverId = req.userId; // Assuming you pass the driver ID as a URL parameter

    // You may want to add additional checks to ensure the driver exists or belongs to the agency user
    const removedDriver = await DRIVER.findOneAndUpdate(
                                                          { _id: driverId },
                                                          {
                                                            $set: {
                                                              is_deleted: true,
                                                            },
                                                          }
                                                        );

    if (!removedDriver) {
      res.send({
        code: constant.error_code,
        message: res.__('deleteDriver.error.unableToDeleteDriver'),
      });
    } else {

      let updateCompany = await user_model.findOneAndUpdate(
                                                              { email: removedDriver.email },
                                                              {
                                                                $set: {
                                                                        isDriverDeleted: true,
                                                                      },
                                                              }
                                                            );
      sendAccountDeactivationEmail(removedDriver);
      return res.send({
                        code: constant.success_code,
                        message: res.__('deleteDriver.success.driverDeleted'),
                      });
      
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.adminDeleteDriver = async (req, res) => {
  try {
    const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

    // You may want to add additional checks to ensure the driver exists or belongs to the agency user
    const removedDriver = await DRIVER.findOneAndUpdate(
                                                          { _id: driverId },
                                                          {
                                                            $set: {
                                                              is_deleted: true,
                                                              jwtToken: null,
                                                              jwtTokenMobile: null,
                                                              webSocketId: null,
                                                              socketId: null
                                                            },
                                                          },
                                                          { new: true }
                                                        );

    if (!removedDriver) {
      res.send({
                code: constant.error_code,
                message: res.__('deleteDriver.error.unableToDeleteDriver'),
              });
    } else {
      

      // update copmany detail when admin will delete its driver
      let updateCompany = await USER.findOneAndUpdate(
                                                        { email: removedDriver.email },
                                                        {
                                                          $set: {
                                                                  isDriverDeleted: true,
                                                                },
                                                        }
                                                      );

      sendAccountDeactivationEmail(removedDriver);
      res.send({
                code: constant.success_code,
                message:  res.__('deleteDriver.success.driverDeleted'),
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

    const driver = await DRIVER.findOne({ _id: driverId, is_deleted: false });

    if (!driver) {
      res.send({
        code: constant.error_code,
        message: res.__('getDriverDetail.error.unableToFetchDriverDetails'),
      });
    } else {
      const completedTrips = await trip_model.find({
                                                      driver_name: driverId,
                                                      trip_status: constant.TRIP_STATUS.COMPLETED,
                                                      is_paid: true,
                                                    })
                                                    .countDocuments();
      const result = driver.toObject();
      result.totalTrips = completedTrips;

      const userPurchasedPlans = await getUserActivePaidPlans(req.user);
      result.plan_access_status = userPurchasedPlans.length > 0 ? true : false;
      // extra data
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      );
      const totalActiveTrips = await trip_model.find({
                                                      driver_name: driverId,
                                                      trip_status: constant.TRIP_STATUS.ACTIVE,
                                                    })
                                                    .countDocuments();
      const totalUnpaidTrips = await trip_model.find({
                                                      driver_name: driverId,
                                                      trip_status: constant.TRIP_STATUS.COMPLETED,
                                                      is_paid: false,
                                                      drop_time: {
                                                        $lte: startOfCurrentWeek,
                                                      },
                                                    })
                                                    .countDocuments();

      const totalReachedTrip = await trip_model.find({
                                                      driver_name: driverId,
                                                      trip_status: constant.TRIP_STATUS.REACHED,
                                                      is_paid: false,
                                                    })
                                                    .countDocuments();
      return res.send({
                        code: constant.success_code,
                        message: res.__('getDriverDetail.success.driverDetailsFetched'),
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
    let getDetail = await USER.findOne({ _id: req.userId });

    const search = req.query.search || "";
    const query = {
      is_deleted: false,
    };
    if (search.length > 0) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { first_name: { $regex: search, $options: "i" } },
        { last_name: { $regex: search, $options: "i" } },
        { address_1: { $regex: search, $options: "i" } },
      ];
    }
    
    const driver = await DRIVER.aggregate([
      {
        $match: query,
      },
      {
        $lookup: {
          from: "trips",
          localField: "_id",
          foreignField: "driver_name",
          as: "tripData",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "defaultVehicle",
          foreignField: "_id",
          as: "defaultVehicle",
        },
      },
      {
        $unwind: {
          path: "$defaultVehicle",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $addFields: {
          totalUnpaidTrips: {
            $size: {
              $filter: {
                input: "$tripData",
                as: "trip",
                cond: {
                  $and: [
                    { $eq: ["$$trip.is_paid", false] },
                    { $eq: ["$$trip.trip_status", "Completed"] },
                  ],
                },
              },
            },
          },
        },
      },
    ]);
    if (driver) {
      // const newDriver = driver.map(d=>d.toJson());
      const fv = getDetail.favoriteDrivers.map((id) => id.toString());
      const result = driver.map((d) => {
        let isFavorite = false;
        if (fv.includes(d._id.toString())) {
          isFavorite = true;
        }
        d.isFavorite = isFavorite;
        return d;
      });
      res.send({
        code: constant.success_code,
        message: res.__('getDrivers.success.driverListRetrieved'),
        result: result,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: res.__('getDrivers.error.noDriversFoundForAgencyUser'),
      });
    }
  } catch (err) {
    console.log("🚀 ~ exports.get_drivers= ~ err:", err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_drivers_list = async (req, res) => {
  let api_start_time = new Date();

  try {
    const agencyUserId = req.userId; // Assuming you have user authentication and user ID in the request
    let getDetail = await USER.findOne({ _id: req.userId });

    const search = req.query.search || "";
    const query = {
      is_deleted: false,
    };
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
      nickName:1,
      phone: 1,
      status: 1,
      is_login: 1,
      isVerified: 1,
    });

    if (driver) {
      const favorite_driver = getDetail.favoriteDrivers.map((id) =>
        id.toString()
      );
      const result = driver.map((d) => {
        const driverObj = d.toObject();
        let isFavorite = false;

        if (favorite_driver.includes(driverObj._id.toString())) {
          isFavorite = true;
        }
        driverObj.isFavorite = isFavorite;
        return driverObj;
      });

      let api_end_time = new Date();

      const differenceInMs = api_end_time - api_start_time;
      const differenceInSeconds = differenceInMs / 1000; // Convert to seconds

      
      res.send({
        code: constant.success_code,
        message: res.__('getDrivers.success.driverListRetrieved'),
        response_time: differenceInSeconds,
        result: result,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: res.__('getDrivers.error.noDriversFoundForAgencyUser'),
      });
    }
  } catch (err) {
    console.log("🚀 ~ exports.get_drivers= ~ err:", err);

    let api_end_time = new Date();

    const differenceInMs = api_end_time - api_start_time;
    const differenceInSeconds = differenceInMs / 1000; // Convert to seconds

    let logs_data = {
      api_start_time: api_start_time,
      api_end_time: api_end_time,
      response_time: differenceInSeconds,
      user_id: req.userId,
      role: req.user.role,
      api_name: req.route ? req.route.path : req.originalUrl,
      error_response: err.message,
    };
    const logEntry = new LOGS(logs_data);
    logEntry.save();
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_drivers_super = async (req, res) => {
  try {
    const data = req.body;
    const search = data.search || "";
    const selectedType = data.selectedType || constant.DRIVER_STATUS.VERIFIED;
    const offline_online_check = data.offline_online_check || constant.DRIVER_OFFLINE_ONLINE_STATUS.ALL;
    const page = parseInt(data.page) || 1; // Current page number, default to 1
    const limit = parseInt(data.limit) || 10; // Number of items per page, default to 10
    const skip = (page - 1) * limit;
    const query = { is_deleted: false, };
    const searchText = data.search.trim();
    const searchWords = searchText.split(/\s+/);
    
    console.log({page , limit , skip})
    
    if (search.length > 0) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { driver_company_name: { $regex: search, $options: "i" } },
        // { first_name: { $regex: search, $options: "i" } },
        // { last_name: { $regex: search, $options: "i" } },
        {
          $expr: {
            $regexMatch: {
              input: { 
                $concat: [
                  { $arrayElemAt: ["$driver_info.first_name", 0] }, 
                  " ", 
                  { $arrayElemAt: ["$driver_info.last_name", 0] }
                ] 
              },
              regex: searchText, // Allows "naruto uzu" to match "naruto uzumaki"
              options: "i"
            }
          }
        },
        // Partial Matching on First and Last Name Separately
        {
          $and: searchWords.map((word, index) => ({
            [index === 0 ? "first_name" : "last_name"]: { $regex: word, $options: "i" }
          }))
        },
        { nickName: { $regex: search, $options: "i" } },
        { address_1: { $regex: search, $options: "i" } },
      ];
    }

    // When user wnats offline drivers
    if (offline_online_check == constant.DRIVER_OFFLINE_ONLINE_STATUS.ONLINE) {
      query.status = true;
      query.is_login = true;
    } else if(offline_online_check == constant.DRIVER_OFFLINE_ONLINE_STATUS.OFFLINE){ // When user wnats online drivers

      if (query?.$or) {
        query.$or.push({status: false});
        query.$or.push({is_login: false});
      } else {
        query.$or = [
          {status: false},
          {is_login: false}
        ];
      }
      
    } else if (offline_online_check == constant.DRIVER_OFFLINE_ONLINE_STATUS.INRIDE) { // When user wnats in ride drivers
      query.is_available = false;
    }

    if (selectedType === constant.DRIVER_STATUS.VERIFIED) {
      query.isVerified = true;
      query.isDocUploaded = true;
    } else if (selectedType === constant.DRIVER_STATUS.UNVERIFIED) {
      query.isVerified = false;
      query.isDocUploaded = true;
    } else if (selectedType === constant.DRIVER_STATUS.REGISTERED) {
      query.isVerified = false;
      query.isDocUploaded = false;
    } else if (selectedType === constant.DRIVER_STATUS.DELETED) {
      query.is_deleted = true;
    }

    // Count the total documents matching the query
    let totalCount = await DRIVER.aggregate([
      {
        $lookup: {
          from: "agencies",
          localField: "company_agency_id",
          foreignField: "_id",
          as: "company",
        },
      },
      {
        $addFields: {
          driver_company_name: { $arrayElemAt: ["$company.company_name", 0] },
        },
      },
      {
        $match:query
      },
      {
        $count: "totalCount",
      },
    ]);
    
    totalCount = totalCount[0]?.totalCount || 0;
    
   

    // Aggregate pipeline to include company name
    const drivers = await DRIVER.aggregate([
      {
        $lookup: {
          from: "agencies", // Referenced collection name
          localField: "company_agency_id", // Local field in DRIVER
          foreignField: "_id", // Foreign field in agency collection
          as: "company", // Name of the resulting array
        },
      },
      {
        $addFields: {
          driver_company_name: { $arrayElemAt: ["$company.company_name", 0] }, // Extract company_name
        },
      },
      {
        $match:query
      },
      {
        $project: {
          _id:1,
          first_name: 1, // Include driver name
          last_name:1,
          bankNumber:1,
          email: 1, // Include driver email
          phone: 1, // Include driver phone
          isVerified: 1,
          kvk:1,
          address_2:1,
          address_1:1,
          city:1,
          country:1,
          zip_code:1,
          phone:1,
          company_account_access:1,
          is_special_plan_active:1,
          profile_image:1,
          gender:1,
          is_available:1,
          is_deleted:1,
          is_blocked:1,
          agency_user_id:1,
          deleted_by:1,
          status:1,
          auto_accept:1,
          driver_status:1,
          created_by:1,
          isVerified:1,
          isDocUploaded:1,
          location:1,
          is_login:1,
          locationUpdatedAt:1,
          isSocketConnected:1,
          socketId:1,
          isWebSocketConnected:1,
          webSocketId:1,
          nickName:1,
          isCompany:1,
          driver_company_id:1,
          company_agency_id:1,
          currentTrip:1,
          defaultVehicle:1,
          driver_documents:1,
          driver_company_name: 1, // Include company name
        },
      },
      {
        // Add lowercase version of company_name for case-insensitive sorting
        $addFields: {
          first_name_lower: { $toLower: "$first_name" },
        },
      },
      {
        $sort: { first_name_lower: 1, _id: -1 }, // Ensure stable sorting
      },
      {
        $skip: skip, // Pagination: Skip documents
      },
      {
        $limit: limit, // Pagination: Limit documents
      },
    ]);

    if (drivers) {
      res.send({
        code: constant.success_code,
        message: res.__('getDrivers.success.driverListRetrieved'),
        query:query,
        result: drivers,
        totalCount: totalCount
      });
    } else {
      res.send({
        code: constant.error_code,
        message: res.__('getDrivers.error.noDriversFoundForAgencyUser'),
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_deleted_drivers_super = async (req, res) => {
  try {
    const search = req.query.search || "";
    const query = {
      is_deleted: true,
    };
    if (search.length > 0) {
      query.$or = [
        { email: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { first_name: { $regex: search, $options: "i" } },
        { last_name: { $regex: search, $options: "i" } },
        { address_1: { $regex: search, $options: "i" } },
      ];
    }
    const drivers = await DRIVER.find(query)
      .populate("defaultVehicle")
      .sort({ createdAt: -1 });

    if (drivers) {
      res.send({
        code: constant.success_code,
        message: res.__('getDrivers.success.driverListRetrieved'),
        result: drivers,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: res.__('getDrivers.error.noDriversFoundForAgencyUser'),
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
    if (err) {
      res.send({
        code: constant.error_code,
        message: err.message,
      });
    }
    try {
      var driver_image = [];
      var driver_documents = [];
      // var imagePortfolioLogo = []
      let option = { new: true };
      let file = req.files;
      if (file) {
        for (i = 0; i < file.length; i++) {
          if (file[i].fieldname == "driver_image") {
            driver_image.push(file[i].location);
          } else if (file[i].fieldname == "driver_documents") {
            driver_documents.push(file[i].location);
          }
        }
      }
      const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter
      const updates = req.body; // Assuming you send the updated driver data in the request body
      if (updates.email) updates.email = updates.email.toLowerCase();
      // Check if the driver exists
      const existingDriver = await DRIVER.findById(driverId);

      // if (!existingDriver || existingDriver.is_deleted) {

      if (!existingDriver) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('updateDriver.error.driverNotFound')
                        });
      }

      req.body.profile_image = driver_image.length != 0 ? driver_image[0] : existingDriver.profile_image;
      req.body.driver_documents =  driver_documents.length != 0 ? driver_documents[0] : existingDriver.driver_documents;

      if (updates.isDocUploaded) {
        updates.isDocUploaded = req.body.isDocUploaded == "true";

        let customer = await stripe.customers.list({ email: existingDriver.email });
        const userFormattedAddress = `${updates?.address_1} ${updates?.address_2} , ${updates?.zip_code}`;
        const stripeUserData = { 
                                  name: updates?.companyName,
                                  email: existingDriver.email,
                                  address: {
                                            line1: userFormattedAddress,
                                            postal_code: updates?.zip_code,
                                            city: updates?.city,
                                            country: updates?.country
                                          }, 
                                          metadata: {
                                                      person_name: `${existingDriver?.first_name} ${existingDriver?.last_name}`
                                                    }
                                };

        if (customer.data.length) {
      
          customer =  customer.data[0]
          await stripe.customers.update(customer.id, stripeUserData); //update user info
          
        } else {
          customer = await stripe.customers.create(stripeUserData ) // create user with new info

        }
      }
      if (updates.is_available) {
        updates.is_available = req.body.is_available == "true";
      }
      if (updates.email != existingDriver.email) {
        let check_other1 = await DRIVER.findOne({ email: updates.email });
        let checkEmailInUser = await USER.findOne({
                                                      email: updates.email,
                                                      ...(existingDriver?.isCompany == true ? { _id: { $ne: new mongoose.Types.ObjectId(existingDriver?.driver_company_id) } } : {}),
                                                    });
        if (check_other1 || checkEmailInUser) {
          return res.send({
                            code: constant.error_code,
                            message: res.__('updateDriver.error.emailExistsWithAnotherAccount')
                          });
          
        }
      }
      if (updates.phone != existingDriver.phone) {
        let check_other2 = await DRIVER.findOne({ phone: updates.phone });
        let checkPhoneInUser = await USER.findOne({
                                                    phone: updates.phone,
                                                    ...(existingDriver?.isCompany == true ? { _id: { $ne: new mongoose.Types.ObjectId(existingDriver?.driver_company_id) } } : {}),
                                                  });
        if (check_other2 || checkPhoneInUser) {
          return res.send({
                            code: constant.error_code,
                            message: res.__('updateDriver.error.phoneExistsWithAnotherAccount')
                          });
        }
      }

      if (updates?.password != '' && updates?.password !== undefined) {
        
        updates.stored_password = updates.password;
        updates.password = await bcrypt.hashSync(updates.password, 10);
        // updates.jwtToken = '';
        // updates.jwtTokenMobile = '';
      } else {
        delete updates.password
      }

      
      const isDriverOnRide = await TRIP.findOne({driver_name: driverId , trip_status: { $in: [ constant.TRIP_STATUS.REACHED , constant.TRIP_STATUS.ACTIVE] } });
      
      // If driver is on ride then he cant be  offline
      if (isDriverOnRide && updates?.status == "false") {

        return res.send({
                          code: constant.error_code,
                          message: res.__('updateDriver.error.cannotGoOfflineWithActiveTrip')
                        });
      }


      const updatedDriver = await DRIVER.findOneAndUpdate( { _id: driverId }, updates, { new: true });

      // Update his company info as well like email , phone and password 
      if (existingDriver?.isCompany == true) {

        const updateCompanyData = {
          email: updates.email,
          phone: updates.phone,
          ...(req.body?.password && req.body.password != '' ? { stored_password: updates.stored_password , password : updates.password } : {}),
        }

        await USER.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(existingDriver?.driver_company_id) } , updateCompanyData , option)
      }

      if (updatedDriver) {
        if (req.body.isDocUploaded) {
          var transporter = nodemailer.createTransport( emailConstant.credentials );
          var mailOptions = {
            from: emailConstant.from_email,
            to: updatedDriver.email,
            subject: "Welcome mail",
            html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
              "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
              <html xmlns="http://www.w3.org/1999/xhtml"><head><meta content="text/html; charset=utf-8" http-equiv="Content-Type"><meta content="width=device-width, initial-scale=1" name="viewport"><title>PropTech Kenya Welcome Email</title><!-- Designed by https://github.com/kaytcat --><!-- Robot header image designed by Freepik.com --><style type="text/css">
                @import url(https://fonts.googleapis.com/css?family=Nunito);

                /* Take care of image borders and formatting */

                img {
                  max-width: 600px;
                  outline: none;
                  text-decoration: none;
                  -ms-interpolation-mode: bicubic;
                }
                html{
                  margin: 0;
                  padding:0;
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

                td, h1, h2, h3  {
                  font-family: Helvetica, Arial, sans-serif;
                  font-weight: 400;
                }

                td {
                  text-align: center;
                }

                body {
                  -webkit-font-smoothing:antialiased;
                  -webkit-text-size-adjust:none;
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

                </style><style media="screen" type="text/css">
                    @media screen {
                      td, h1, h2, h3 {
                        font-family: 'Nunito', 'Helvetica Neue', 'Arial', 'sans-serif' !important;
                      }
                    }
                </style><style media="only screen and (max-width: 480px)" type="text/css">
                  /* Mobile styles */
                  @media only screen and (max-width: 480px) {

                    table[class="w320"] {
                      width: 320px !important;
                    }
                  }
                </style>
                <style type="text/css"></style>

                </head>
                <body bgcolor="#fff" class="body" style="padding:0px; margin:0; display:block; background:#fff;">
              <table align="center" cellpadding="0" cellspacing="0" height="100%" width="600px" style=" margin-top: 30px; margin-bottom: 10px; border-radius: 10px; box-shadow: 0px 1px 4px 0px rgb(0 0 0 / 25%); background:#ccc; ">
              <tbody><tr>
              <td align="center" bgcolor="#fff" class="" valign="top" width="100%">
              <center class=""><table cellpadding="0" cellspacing="0" class="w320" style="margin: 0 auto;" width="600">
              <tbody><tr>
              <td align="center" class="" valign="top">
              <table bgcolor="#fff" cellpadding="0" cellspacing="0" class="" style="margin: 0 auto; width: 100%; margin-top: 0px;">
              <tbody style="margin-top: 5px;">
                <tr class="" style="border-bottom: 1px solid #cccccc38;">
              <td class="">
              </td>
              </tr>
              <tr class=""><td class="headline">${res.__('updateDriver.success.emailDocumentUnderReviewConetnt.welcomeToIDispatch')}</td></tr>
              <tr>
              <td>
              <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
              <td class="" style="color:#444; font-weight: 400;"><br>
              <br><br>
              ${res.__('updateDriver.success.emailDocumentUnderReviewConetnt.driverRegistrationUnderReview')}
              <br>
               <br>
                Your login credentials are provided below:
              <br>
              <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${updatedDriver?.email}</span>
               <br>
              <br><br>
              <br></td>
              </tr>
              </tbody></table></center>
              </td>
              </tr>
              <tr>
              <td class="">
              <div class="">
              <a style="background-color:#0682ca;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="https://idispatch.nl/login">${res.__('updateDriver.success.emailDocumentUnderReviewConetnt.visitAccountAndManage')}</a>
              </div>
               <br>
              </td>
              </tr>
              </tbody>

              </table>
              </body></html>`,
          };

          await transporter.sendMail(mailOptions);
        }
        res.send({
          code: constant.success_code,
          message: res.__('updateDriver.success.driverAccountUpdated'),
          result: updatedDriver,
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

exports.restoreDriver = async (req, res) => {
  try {

    const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter
    const existingDriver = await DRIVER.findById(driverId);

    if (existingDriver) {

      let updatedDriver = await DRIVER.findOneAndUpdate( 
                                                          { _id: driverId }, 
                                                          {
                                                            is_deleted: false,
                                                          }, 
                                                          { new: true }
                                                        );

      let updateCompany = await USER.findOneAndUpdate(
                                                        { email: existingDriver.email },
                                                        {
                                                          $set: {
                                                                  isDriverDeleted: false,
                                                                },
                                                        }
                                                      );
     
      
      sendAccountReactivationEmail(existingDriver)
      return res.send({
                        code: constant.success_code,
                        message: res.__('restoreDriver.success.driverRestored'),
                      });
    } else {

      return res.send({
                        code: constant.error_code,
                        message: res.__('restoreDriver.error.driverNotExist'),
                      });
    }
  } catch (err) {
    return res.send({
                    code: constant.error_code,
                    message: err.message,
                  });
  }
}
exports.updateLocation = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: data.driverId };
    let option = { new: true };

    let updateLocation = await DRIVER.findOneAndUpdate(
      criteria,
      {
        location: data.location,
        city: data.city,
      },
      option
    );
    if (!updateLocation) {
      res.send({
        code: constant.error_code,
        message: "Unable to update the location",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Updated successfully",
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};
exports.updateVerification = async (req, res) => {
  try {
    const { id } = req.params;

    let updateDriver = await DRIVER.findOneAndUpdate(
      { _id: id },
      {
        $set: { isVerified: true },
      }
    );
    if (!updateDriver) {
      return res.send({
        code: constant.error_code,
        message: "Unable to update the verification",
      });
    }
    var transporter = nodemailer.createTransport(emailConstant.credentials);
    var mailOptions = {
      from: emailConstant.from_email,
      to: updateDriver.email,
      subject: "Driver Verified Successfully",
      html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
              "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
              <html xmlns="http://www.w3.org/1999/xhtml"><head><meta content="text/html; charset=utf-8" http-equiv="Content-Type"><meta content="width=device-width, initial-scale=1" name="viewport"><title>Reset your password</title><!-- Designed by https://github.com/kaytcat --><!-- Robot header image designed by Freepik.com --><style type="text/css">
              @import url(https://fonts.googleapis.com/css?family=Nunito);

              /* Take care of image borders and formatting */

              img {
                max-width: 600px;
                outline: none;
                text-decoration: none;
                -ms-interpolation-mode: bicubic;
              }
              html{
                margin: 0;
                padding:0;
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

              td, h1, h2, h3  {
                font-family: Helvetica, Arial, sans-serif;
                font-weight: 400;
              }

              td {
                text-align: center;
              }

              body {
                -webkit-font-smoothing:antialiased;
                -webkit-text-size-adjust:none;
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


            </style><style media="screen" type="text/css">
                @media screen {
                  td, h1, h2, h3 {
                    font-family: 'Nunito', 'Helvetica Neue', 'Arial', 'sans-serif' !important;
                  }
                }
            </style><style media="only screen and (max-width: 480px)" type="text/css">
              /* Mobile styles */
              @media only screen and (max-width: 480px) {

                table[class="w320"] {
                  width: 320px !important;
                }
              }
            </style>
            <style type="text/css"></style>

</head>
<body bgcolor="#fff" class="body" style="padding:0px; margin:0; display:block; background:#fff;">
<table align="center" cellpadding="0" cellspacing="0" height="100%" width="600px" style="
  margin-top: 30px;
  margin-bottom: 10px;
border-radius: 10px;
box-shadow: 0px 1px 4px 0px rgb(0 0 0 / 25%);
background:#ccc;
">
<tbody><tr>
<td align="center" bgcolor="#fff" class="" valign="top" width="100%">
<center class=""><table cellpadding="0" cellspacing="0" class="w320" style="margin: 0 auto;" width="600">
<tbody><tr>
<td align="center" class="" valign="top">
<table bgcolor="#fff" cellpadding="0" cellspacing="0" class="" style="margin: 0 auto; width: 100%; margin-top: 0px;">
<tbody style="margin-top: 5px;">
<tr class="" style="border-bottom: 1px solid #cccccc38;">
<td class="">

</td>
</tr>
<tr class=""><td class="headline"> iDispatch!</td></tr>
<tr>
<td>
<center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
<td class="" style="color:#444; font-weight: 400;"><br>
We are pleased to inform you that your driver account has been verified successfully! You can now log in and access your account.
<br>
<br>
<br></td>
</tr>
</tbody></table></center>
</td>
</tr>
<tr>
<td class="">
<div class="">
</div>
<br>
</td>
</tr>
</tbody>

</table>

<table bgcolor="#fff" cellpadding="0" cellspacing="0" class="force-full-width" style="margin: 0 auto; margin-bottom: 5px:">
<tbody>
<tr>
<td class="" style="color:#444;
                  ">
</td>
</tr>
</tbody></table></td>
</tr>
</tbody></table></center>
</td>
</tr>
</tbody></table>
</body></html>`,
    };
    await transporter.sendMail(mailOptions);

    res.send({
      code: constant.success_code,
      message: "Updated successfully",
    });
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};
exports.rejectVerification = async (req, res) => {
  try {
    const { id } = req.params;

    let updateDriver = await DRIVER.findOneAndUpdate(
      { _id: id },
      {
        $set: { isDocUploaded: false },
      }
    );
    if (!updateDriver) {
      return res.send({
        code: constant.error_code,
        message: "Unable to update the verification",
      });
    }
    var transporter = nodemailer.createTransport(emailConstant.credentials);
    var mailOptions = {
      from: emailConstant.from_email,
      to: updateDriver.email,
      subject: "",
      html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
"http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml"><head><meta content="text/html; charset=utf-8" http-equiv="Content-Type"><meta content="width=device-width, initial-scale=1" name="viewport"><title>Reset your password</title><!-- Designed by https://github.com/kaytcat --><!-- Robot header image designed by Freepik.com --><style type="text/css">
@import url(https://fonts.googleapis.com/css?family=Nunito);

/* Take care of image borders and formatting */

img {
  max-width: 600px;
  outline: none;
  text-decoration: none;
  -ms-interpolation-mode: bicubic;
}
html{
  margin: 0;
  padding:0;
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

td, h1, h2, h3  {
  font-family: Helvetica, Arial, sans-serif;
  font-weight: 400;
}

td {
  text-align: center;
}

body {
  -webkit-font-smoothing:antialiased;
  -webkit-text-size-adjust:none;
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


</style><style media="screen" type="text/css">
    @media screen {
      td, h1, h2, h3 {
        font-family: 'Nunito', 'Helvetica Neue', 'Arial', 'sans-serif' !important;
      }
    }
</style><style media="only screen and (max-width: 480px)" type="text/css">
  /* Mobile styles */
  @media only screen and (max-width: 480px) {

    table[class="w320"] {
      width: 320px !important;
    }
  }
</style>
<style type="text/css"></style>

</head>
<body bgcolor="#fff" class="body" style="padding:0px; margin:0; display:block; background:#fff;">
<table align="center" cellpadding="0" cellspacing="0" height="100%" width="600px" style="
  margin-top: 30px;
  margin-bottom: 10px;
border-radius: 10px;
box-shadow: 0px 1px 4px 0px rgb(0 0 0 / 25%);
background:#ccc;
">
<tbody><tr>
<td align="center" bgcolor="#fff" class="" valign="top" width="100%">
<center class=""><table cellpadding="0" cellspacing="0" class="w320" style="margin: 0 auto;" width="600">
<tbody><tr>
<td align="center" class="" valign="top">
<table bgcolor="#fff" cellpadding="0" cellspacing="0" class="" style="margin: 0 auto; width: 100%; margin-top: 0px;">
<tbody style="margin-top: 5px;">
<tr class="" style="border-bottom: 1px solid #cccccc38;">
<td class="">

</td>
</tr>
<tr class=""><td class="headline"> iDispatch!</td></tr>
<tr>
<td>
<center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
<td class="" style="color:#444; font-weight: 400;"><br>
We regret to inform you that the documents provided for your driver profile verification have failed to meet our requirements. Kindly review your profile and resubmit the necessary documents. Alternatively, you can reach out to our customer support for further assistance.
<br>
<br>
<br></td>
</tr>
</tbody></table></center>
</td>
</tr>
<tr>
<td class="">
<div class="">
</div>
<br>
</td>
</tr>
</tbody>

</table>

<table bgcolor="#fff" cellpadding="0" cellspacing="0" class="force-full-width" style="margin: 0 auto; margin-bottom: 5px:">
<tbody>
<tr>
<td class="" style="color:#444;
                  ">
</td>
</tr>
</tbody></table></td>
</tr>
</tbody></table></center>
</td>
</tr>
</tbody></table>
</body></html>`,
    };
    await transporter.sendMail(mailOptions);

    res.send({
      code: constant.success_code,
      message: "Updated successfully",
    });
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_active_drivers = async (req, res) => {
  try {
    let currentDate = new Date();
    const threeHoursBefore = new Date(
      currentDate.getTime() - 3 * 60 * 60 * 1000
    );
    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(
      startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
    ); // Set to Monday of current week


    let getDetail;

    if (req.user.role == constant.ROLES.COMPANY) {

      getDetail = await USER.findOne({ _id: req.userId });
    } else if(req.user.role == constant.ROLES.DRIVER){

      getDetail = await DRIVER.findOne({ _id: req.userId });
    }
    ;
    
    let getDrivers = await DRIVER.aggregate([
      {
        $match: {
          status: true,
          is_login: true,
          isVerified: true,
          isDocUploaded: true,
          is_deleted: false,
          defaultVehicle: { $ne: null },
          lastUsedTokenMobile: { $gte: threeHoursBefore },
          "location.coordinates": { $ne: [null, null] },
        },
      },
      {
        $lookup: {
          from: "vehicles", // Assuming the collection name for vehicles is "vehicles"
          localField: "defaultVehicle",
          foreignField: "_id",
          as: "defaultVehicle",
        },
      },
      {
        $unwind: "$defaultVehicle",
      },
      {
        $lookup: {
          localField: "_id",
          foreignField: "driver_name",
          from: "trips",
          as: "tripData",
          pipeline: [
            {
              $match: {
                is_paid: "false",
                trip_status: "Completed",
                drop_time: {
                  $lte: startOfCurrentWeek,
                },
              },
            },
          ],
        },
      },
      {
        $addFields: {
          totalUnpaidTrips: {
            $size: "$tripData",
          },
        },
      },
      {
        $lookup: {
          localField: "_id",
          foreignField: "driver_name",
          from: "trips",
          as: "tripDataBooked",
          pipeline: [
            {
              $match: {
                trip_status: "Booked",
              },
            },
          ],
        },
      },
      {
        $addFields: {
          totalBookedTrip: {
            $size: "$tripDataBooked",
          },
        },
      },
      //reached count
      {
        $lookup: {
          localField: "_id",
          foreignField: "driver_name",
          from: "trips",
          as: "tripDataReached",
          pipeline: [
            {
              $match: {
                trip_status: "Reached",
              },
            },
          ],
        },
      },
      {
        $addFields: {
          totalReachedTrip: {
            $size: "$tripDataReached",
          },
        },
      },
      {
        $lookup: {
          from: "subscriptions", // Assuming the collection name for subscriptions is "subscriptions"
          localField: "_id",
          foreignField: "purchaseByDriverId", // Adjust based on your schema
          as: "subscriptionData",
          pipeline: [
            {
              $match: {
                paid: true,
                endPeriod: { $gt: new Date() }, // Current date filter
              },
            },
          ],
        },
      },
      {
        $match: {
          $or: [
            { is_special_plan_active: true }, // subscription will not check when is_special_plan_active is true
            { 
              totalUnpaidTrips: 0, 
              subscriptionData: { $ne: [] } // If user didn't have the plan then it will not add in the list if he didn't have is_special_plan_active true
            }
          ]
        }
      },
      {
        $match: {
          totalUnpaidTrips: 0,
        },
      },
      {
        $sort: { createdAt: -1 },
      },
    ]);


    if (!getDrivers) {
      res.send({
        code: constant.error_code,
        message: "Unable to fetch the drivers",
      });
    } else {
      const fv = getDetail?.favoriteDrivers?.map((id) => id.toString()) || [];
      const driver = getDrivers.map((d) => d);
      const result = driver.map((d) =>  {
                                            let isFavorite = false;
                                            if (fv.includes(d._id.toString())) {
                                              isFavorite = true;
                                            }
                                            d.isFavorite = isFavorite;
                                            return d;
                                        });
      res.send({
        code: constant.success_code,
        count: getDrivers.length,
        message: "Success",
        result,
      });
    }
  } catch (err) {
    console.log("🚀 ~ exports.get_active_drivers= ~ err:", err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.logout = async (req, res) => {
  try {
    let data = req.body;
    // let updateLogin = await DRIVER.findOneAndUpdate(
    //   { _id: data.driverId },
    //   { is_login: false },
    //   { new: true }
    // );

    let driverInfo = await DRIVER.findOne({ _id: data.driverId });
    let user_info = await USER.findOne({ _id: data.driverId });

    if (driverInfo) {
      // if driver is logging out
      let driverUpdate = await DRIVER.findOneAndUpdate(
                                                        { _id: data.driverId },
                                                        {
                                                          $set: { 
                                                                  is_login: false, 
                                                                  deviceToken: null, // driver will not recieve any notification in his device
                                                                  webDeviceToken: null,
                                                                  status: false // driver will be offline
                                                                 },
                                                        },
                                                        { new: true }
                                                      );

      if (driverInfo?.isCompany) { // if driver also a company

        let companyUpdate = await USER.findOneAndUpdate(
                                                          { _id: driverInfo?.driver_company_id },
                                                          {
                                                            $set: { deviceToken: null   , webDeviceToken: null,},
                                                          },
                                                          { new: true }
                                                        );
      }
    } else {
      // If company logging out
      let companyUpdate = await USER.findOneAndUpdate(
                                                      { _id: data.driverId },
                                                      {
                                                        $set: { deviceToken: null  , webDeviceToken: null,},
                                                      },
                                                      { new: true }
                                                    );

      if (user_info?.isDriver) { // if driver also a company

        let companyUpdate = await DRIVER.findOneAndUpdate(
                                                            { _id: user_info?.driverId },
                                                            {
                                                              $set: { 
                                                                      is_login: false, 
                                                                      deviceToken: null, // driver will not recieve any notification in his device,
                                                                      webDeviceToken: null,
                                                                      status: false // driver will be offline
                                                                    },
                                                            },
                                                            { new: true }
                                                          );
      }
    }

    res.send({
      code: constant.success_code,
      message: "Logout successfully",
    });
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.convertIntoDriver = async (req, res) => {
  driverUpload(req, res, async (err) => {
    try {
      const data = req.body;
      var driver_image = [];
      var driver_documents = [];

      
      // var imagePortfolioLogo = []
      let file = req.files;
      for (i = 0; i < file.length; i++) {
        if (file[i].fieldname == "driver_image") {
          driver_image.push(file[i].location);
        } else if (file[i].fieldname == "driver_documents") {
          driver_documents.push(file[i].location);
        }
      }

      // let hash = await bcrypt.hashSync(data.password, 10);
      // data.password = hash;
      data.profile_image =
        driver_image?.length != 0
          ? driver_image[0]
          : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg";
      data.driver_documents =
        driver_documents?.length != 0
          ? driver_documents[0]
          : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg";
      let user = req.user;
      if (req.user.isDriver) {
        res.json({
          code: constant.error_code,
          message: "Already have a driver",
        });
      }

      const companyInfo = await USER.aggregate([
        {
          $lookup: {
            from: "agencies", 
            localField: "_id", 
            foreignField: "user_id", 
            as: "agency_data",
          },
        },
        {
          $match: {
            _id: new mongoose.Types.ObjectId(req.userId),
          },
        },
        {
          $project: {
            name: 1, // Include driver name
            user_info: "$$ROOT",
            companyDetails: { $arrayElemAt: ["$agency_data", 0] }, // Include the first matching company
          },
        },
      ]);
      
      const company_agency_id = companyInfo ? companyInfo[0].companyDetails._id : null;

      let customer = await stripe.customers.list({ user: data.email });
      customer = customer.data.length ? customer.data[0] : await stripe.customers.create({ email: user.email });

      stripeCustomerId = customer.id;
      const driverCounterId = `D-`+ await getDriverNextSequenceValue();
      
      let save_driver = await DRIVER({
        ...data,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        password: user.password,
        phone: user.phone,
        isCompany: true,
        created_by: user._id,
        isDocUploaded: true,
        driver_company_id: req.userId,
        company_agency_id:company_agency_id,
        driverCounterId: driverCounterId,
        stripeCustomerId: stripeCustomerId
      }).save();

      let jwtToken = jwt.sign( { userId: save_driver._id }, process.env.JWTSECRET, { expiresIn: "365d" } );

      if (req.isMobile) save_driver.jwtTokenMobile = jwtToken;
      else save_driver.jwtToken = jwtToken;
      const result = save_driver.toObject();
      result.role = "DRIVER";
      req.user.isDriver = true;

      req.user.driverId = save_driver._id;
      let saveUserData = await req.user.save();

      const newUser = await user_model.updateOne(
                                                  { _id: req.user._id },
                                                  {
                                                    driverId: save_driver._id,
                                                    isDriver: true,
                                                  }
                                                );
      await save_driver.save();
      if (!save_driver) {
        res.send({
          code: constant.error_code,
          message: "Unable to save the data",
        });
      } else {
        res.send({
          code: constant.success_code,
          message: "Driver created successfully",
          result,
          jwtToken,
        });
      }
    } catch (err) {
      console.log("🚀 ~ driverUpload ~ err:", err);
      res.send({
        code: constant.error_code,
        message: err.message,
      });
    }
  });
};

exports.switchToDriver = async (req, res) => {
  try {
    let currentDate = new Date();

    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(
      startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
    ); // Set to Monday of current week


    // let driverData = await DRIVER.findOne({ _id: driverId, is_deleted: false});

    let user = req.user;
    let driverId;

    // If current user have company partner access in token
    if (req?.companyPartnerAccess) {
      driverId = new mongoose.Types.ObjectId(req.CompanyPartnerDriverId);
    } else {
      driverId = new mongoose.Types.ObjectId(req.user.driverId);
    }


    let driverData = await DRIVER.findOne({
                                            _id: driverId,
                                            is_deleted: false,
                                          });

    if (!driverData) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('switchProfile.switchToDriver.error.noDriverProfile'),
                      });
    } else if (driverData?.is_blocked) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('switchProfile.switchToDriver.error.driverBlocked'),
                      });
    }else {

    
      let jwtToken = jwt.sign(
                              { 
                                userId: driverData._id,
                                companyPartnerAccess: false,
                              },
                              process.env.JWTSECRET,
                              { expiresIn: "365d" }
                            );

      const totalUnpaidTrips = await trip_model.find({
                                                      driver_name: driverData._id,
                                                      trip_status: "Completed",
                                                      is_paid: false,
                                                      drop_time: {
                                                        $lte: startOfCurrentWeek,
                                                      },
                                                    })
                                                    .countDocuments();

      if (req.isMobile) {
        driverData.jwtTokenMobile = jwtToken;
        driverData.lastUsedTokenMobile = new Date();
      } else {
        driverData.jwtToken = jwtToken;
        driverData.lastUsedToken = new Date();
      }

      driverData.is_login = true;
      driverData.currently_active_company = null;
      let result = driverData.toObject();
      await driverData.save();
      result.totalUnpaidTrips = totalUnpaidTrips;
      result.role = "DRIVER";

      res.send({
        code: constant.success_code,
        message: res.__('switchProfile.switchToDriver.success.profileSwitched'),
        result,
        jwtToken,
      });
    }
  } catch (err) {
    console.log("🚀 ~ driverUpload ~ err:", err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.switchToCompany = async (req, res) => {
  try {
    let isMobile = req.isMobile;


    const driverId = new mongoose.Types.ObjectId(req.companyPartnerAccess ? req.CompanyPartnerDriverId : req.userId);

    let driverData = await DRIVER.findOne({ _id: driverId, is_deleted: false});

    let user = req.user;

    let companyData = await user_model.findOne({
                                                email: driverData.email,
                                                is_deleted: false,
                                              });

    if (!companyData) {
      res.send({
        code: constant.error_code,
        message: "You don not have company profile",
      });
    } else if (companyData?.is_blocked) {
      return res.send({
                        code: constant.error_code,
                        message: `The company has been blocked. If you believe this is an error, please contact the support team for assistance`,
                      });
    }else {
      let jwtToken = jwt.sign(
        { 
          userId: companyData._id,
          companyPartnerAccess: false,
        }, 
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );

      let updateData = {}
      const result = companyData.toObject();
      if (req.isMobile) {
        updateData.jwtTokenMobile = jwtToken;
        updateData.lastUsedTokenMobile = new Date();
      } else {
        updateData.jwtToken = jwtToken;
        updateData.lastUsedToken = new Date();
      }

      await user_model.findByIdAndUpdate( {_id: companyData._id}, { $set: updateData }, { new: true });
      // await companyData.save();
      

      // When driver switch account from partner account to his compnay account
      driverData.currently_active_company = null;
      await driverData.save();
      
      result.role = "COMPANY";
      // result.driver = user;
      result.driver = driverData;
      res.send({
        code: constant.success_code,
        message: "data fetch successfully",
        result,
        jwtToken,
      });
    }
  } catch (err) {
    console.log("🚀 ~ driverUpload ~ err:", err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};


exports.switchDriverToPartnerCompany = async (req, res) => {
  try {

    let currentDate = new Date();
    const companyDetails = await USER.findById(req.params.companyId);

    if (companyDetails?.is_blocked) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('switchProfile.switchToCompanyPertner.error.companyBlocked')
                      });
    }

    const companyId = new mongoose.Types.ObjectId(req.params.companyId);
    const driverId = new mongoose.Types.ObjectId(req.companyPartnerAccess ? req.CompanyPartnerDriverId : req.userId);
    
    const driverHasCompanyPartnerAccess = await DRIVER.findOne({
                                                                _id: driverId,
                                                                parnter_account_access : {
                                                                  $elemMatch: { company_id: companyId },
                                                                },
                                                              });

    const companygaveDriverPartnerAccess = await USER.findOne({
                                                                  _id: companyId,
                                                                  role: constant.ROLES.COMPANY,
                                                                  parnter_account_access : {
                                                                    $elemMatch: { driver_id: driverId },
                                                                  },
                                                                });

    // If driver doesn't have company access or company  didn't gave the access to the driver
    if (!driverHasCompanyPartnerAccess || !companygaveDriverPartnerAccess) {

      return res.send({
        code: constant.error_code,
        message: res.__('switchProfile.switchToCompanyPertner.error.noPartnerAccessToCompany')
      });
    } 
      

    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(
      startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
    ); // Set to Monday of current week
    let user = req.user;

    let driverData = await DRIVER.findOne({ _id: driverId, is_deleted: false});

    if (!driverData) {
      res.send({
        code: constant.error_code,
        message:  res.__('switchProfile.switchToCompanyPertner.error.noDriverProfile')
      });
    } else {

      let jwtToken = jwt.sign(
                                { 
                                  userId: companyId,
                                  companyPartnerAccess: true,
                                  CompanyPartnerDriverId: driverData._id
                                },
                                process.env.JWTSECRET,
                                { expiresIn: "365d" }
                              );
      

      if (req.isMobile) {
        driverData.jwtTokenMobile = jwtToken;
        driverData.lastUsedTokenMobile = new Date();
      } else {
        driverData.jwtToken = jwtToken;
        driverData.lastUsedToken = new Date();
      }

      driverData.currently_active_company = companyId;
      let result = driverData.toObject();
      await driverData.save();

      let companyPurchasedPlans = await getUserActivePaidPlans(result);
      result.plan_access_status = companyPurchasedPlans.length > 0 ? true : false;
      
      result.role = "COMPANY_PARTNER";

      res.send({
        code: constant.success_code,
        message: res.__('switchProfile.switchToCompanyPertner.success.profileSwitched'),
        result,
        jwtToken,
      });
    }
  } catch (err) {
    console.log("🚀 ~ driverUpload ~ err:", err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.deleteDriver = async (req, res) => {
  try {
    let driver = await DRIVER.findOneAndUpdate(
      { _id: req.params.id },
      { is_deleted: true }
    );
    let companyData = await user_model.findOne({
      email: driver.email,
      is_deleted: false,
    });
    if (!companyData) {
      res.send({
        code: constant.success_code,
        message: "Deleted successfully",
      });
    } else {
      companyData.isDriver = false;
      companyData.driverId = null;
      await companyData.save();
      res.send({
        code: constant.success_code,
        message: "Deleted successfully",
      });
    }
  } catch (err) {
    console.log("🚀 ~ driverUpload ~ err:", err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};
