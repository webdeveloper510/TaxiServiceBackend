require("dotenv").config();
const { default: axios } = require("axios");
const CONSTANT = require("../../config/constant");
const USER = require("../../models/user/user_model");
const AGENCY = require("../../models/user/agency_model");
const FEEDBACK = require("../../models/user/feedback_model");
const DRIVER = require("../../models/user/driver_model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const randToken = require("rand-token").generator();
const multer = require("multer");
const path = require("path");
const moment = require("moment");
const constant = require("../../config/constant");
const stripe = require("stripe")(
  "sk_test_51OH1cSSIpj1PyQQaTWeLDPcDsiROliXqsb2ROV2SvHEXwIBbnM9doAQF4rIqWGTTFM7SK4kBxjMmSXMgcLcJTSVh00l0kUa708"
);
const { getUserActivePaidPlans , getUserCurrentActivePayedPlan , passwordResetOtpEmail } = require("../../Service/helperFuntion");
const { updateDriverMapCache } = require("../../Service/location.service")
const { redis , sub }= require("../../utils/redis");
const mongoose = require("mongoose");
const trip_model = require("../../models/user/trip_model");
const driver_model = require("../../models/user/driver_model");
const user_model = require("../../models/user/user_model");
const { sendSms } = require("../../Service/helperFuntion");
const { v4: uuidv4 } = require("uuid");

const removeOTPAfter5Minutes = async (login_sms_otp_uid) => {
  try {
    const updatedUser = await USER.findOneAndUpdate(
      { login_sms_otp_uid: login_sms_otp_uid }, // Query to find the document
      { $set: { login_sms_otp: "" } }, // Update operations
      { new: true, useFindAndModify: false } // Options
    );

    return updatedUser;
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌ remove otp after 5c minutes error --------------' , error.message)
  }
};

exports.create_super_admin = async (req, res) => {
  try {
    let data = req.body;
    let checkEmail = await USER.findOne({ email: data.email });
    if (checkEmail) {
      res.send({
        code: CONSTANT.error_code,
        message: res.__('createSuperAdmin.error.emailAlreadyInUse'),
      });
      return;
    }
    let checkPhone = await USER.findOne({ phone: data.phone });
    if (checkPhone) {
      res.send({
        code: CONSTANT.error_code,
        message: res.__('createSuperAdmin.error.phoneAlreadyInUse'),
      });
      return;
    }
    data.stored_password = data.password;
    let hash = await bcrypt.hashSync(data.password, 10);
    data.password = hash;
     
    let save_data = await USER(data).save();
    if (!save_data) {
      res.send({
        code: CONSTANT.error_code,
        message: res.__('createSuperAdmin.error.saveFailed'),
      });
    } else {
      let jwtToken = jwt.sign(
        { 
          userId: save_data._id,
          companyPartnerAccess: false
        },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      save_data.jwtToken = jwtToken;
      res.send({
        code: CONSTANT.success_code,
        message: res.__('createSuperAdmin.success.accountCreated'),
        result: save_data,
      });
    }
  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌ create super admin error --------------' , err.message)
    res.send({
      code: CONSTANT.error_code,
      message: err.message,
    });
  }
};

exports.login = async (req, res) => {

  try {
    let currentDate = new Date();
    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(
      startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
    ); // Set to Monday of current week
    let data = req.body;
    const deviceToken = data.deviceToken;
    const webDeviceToken = data.webDeviceToken;
    const mobile = data?.platform == CONSTANT.PLATFORM.MOBILE;
    const locale = CONSTANT.INTERNATIONALIZATION_LANGUAGE.ENGLISH === req.query.lang ? CONSTANT.INTERNATIONALIZATION_LANGUAGE.ENGLISH : CONSTANT.INTERNATIONALIZATION_LANGUAGE.DUTCH;
    
    if ( !data || typeof data.email !== "string" || typeof data.password !== "string") {
      return res.send({
                        code: constant.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }

    if (data.email.length > 255 || data.password.length > 128) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }
    
    const normalizedEmail = data.email.trim().toLowerCase();

    let check_data;
    let userData = await USER.findOne(
                                        { email: normalizedEmail }, // Exact match on content
                                        null,
                                        { collation: { locale: 'en', strength: 2 } } // Case-insensitive
                                      // {
                                      //   $and: [
                                      //     {
                                      //       $or: [
                                      //         { email: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
                                      //         { phone: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
                                      //       ],
                                      //     },
                                      //     // {
                                      //     //   is_deleted: false,
                                      //     // },
                                      //   ],
                                      // }
                                    )

                           
    if (userData?.is_deleted) {
      return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accountDeleted'),
                          de: userData?.is_deleted,
                          email: userData?.email
                        });
    }

    
    // If user is blocked by admin or super admin
    if (userData && userData.role != "SUPER_ADMIN" && (userData?.is_blocked) ) {

      if ( userData.role != CONSTANT.ROLES.COMPANY) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accessRestricted')
                        });
      } else if (userData?.role == CONSTANT.ROLES.COMPANY && userData?.isDriver == false){
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accessRestricted')
                        });
      } else {}
      
    }else if (userData?.role == CONSTANT.ROLES.HOTEL) {

      let hotelCreatedBy = await USER.findOne({_id: userData.created_by})

      if (hotelCreatedBy?.is_blocked) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.companyAccessRestricted')
           });
      }
    }

    
    // drver login code
    if (!userData || (userData?.role == CONSTANT.ROLES.COMPANY &&  userData?.isDriver == true && userData?.is_blocked == true)) {

      let DriverDetails = await DRIVER.findOne({ email:normalizedEmail, is_deleted: false, });
      

      if (!DriverDetails) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.incorrectCredentials'),
                        });
      }

      if (DriverDetails?.is_blocked){
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accessRestricted')
                        });
      }

      const completedTrips = await trip_model.countDocuments({
                                                                driver_name: DriverDetails._id,
                                                                trip_status: "Completed",
                                                                is_paid: false,
                                                              }); 

      const totalUnpaidTrips = await trip_model.countDocuments({
                                                                driver_name: DriverDetails._id,
                                                                trip_status: "Completed",
                                                                is_paid: false,
                                                                drop_time: {
                                                                  $lte: startOfCurrentWeek,
                                                                },
                                                              });

      const totalActiveTrips = await trip_model.countDocuments({
                                                                driver_name: DriverDetails._id,
                                                                trip_status: "Active",
                                                              });

      let checkPassword = await bcrypt.compare(
                                                data.password,
                                                DriverDetails.password
                                              );

        
      if (!checkPassword) {
        return res.send({
                          code: CONSTANT.error_code,
                          message: res.__('userLogin.error.incorrectCredentials')
                        });
        
      }
      // if (data.is_app && check_again.is_login) {
      //     res.send({
      //         code: constant.error_code,
      //         message: "You need to logout from previous device first"
      //     })
      //     return;
      // }
      if (deviceToken) {
        await Promise.all([
          driver_model.updateMany(
                                    {
                                      deviceToken,
                                    },
                                    {
                                      deviceToken: null,
                                    }
                                  ),
          user_model.updateMany(
                                  {
                                    deviceToken,
                                  },
                                  {
                                    deviceToken: null,
                                  }
                                ),
        ]);
      }

      let jwtToken =  jwt.sign(
                                { 
                                  userId: DriverDetails._id,
                                  companyPartnerAccess: false
                                },
                                process.env.JWTSECRET,
                                { expiresIn: "365d" }
                              );

      const updateDriver = { is_login: true };
      

      let setLocale = mobile ? { app_locale: locale } : { web_locale: locale }

      if (mobile) {
        updateDriver.jwtTokenMobile = jwtToken;
        updateDriver.lastUsedTokenMobile = new Date();
        updateDriver.app_locale = locale;
      } else {
        updateDriver.jwtToken = jwtToken;
        updateDriver.webDeviceToken = webDeviceToken;
        updateDriver.lastUsedToken = new Date();
        updateDriver.web_locale = locale;
      }

      if (deviceToken) {
        updateDriver.deviceToken = deviceToken;
      }
      let updateLogin = await DRIVER.findOneAndUpdate(
                                                        { _id: DriverDetails._id },
                                                        { $set: updateDriver },
                                                        { new: true }
                                                      );

      if (updateLogin?.isCompany) {

        await USER.updateOne( { _id: updateLogin.driver_company_id }, { $set: { deviceToken: deviceToken , webDeviceToken: webDeviceToken , ...setLocale } });
      }

      updateLogin = updateLogin.toObject();
      updateLogin.role = "DRIVER";
      updateLogin.totalTrips = completedTrips;
      updateLogin.totalUnpaidTrips = totalUnpaidTrips;
      updateLogin.totalActiveTrips = totalActiveTrips;

      // update driver cahce data
      updateDriverMapCache(DriverDetails._id);
      return res.send({
                        code: CONSTANT.success_code,
                        message: res.__('userLogin.success.loginWelcome'),
                        result: updateLogin,
                        jwtToken: jwtToken,
                      });
    } else {

      check_data = userData;

      // If user blocked by Super admin or admin
      if (check_data?.is_blocked) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accessRestricted')
                        });
      }

      // compare the password
      let checkPassword = await bcrypt.compare( data.password, check_data.password );

      if (!checkPassword) {
        return res.send({
                          code: CONSTANT.error_code,
                          message: res.__('userLogin.error.incorrectCredentials'),
                        });
      }

      //  OTP will send during the login for ADMIN AND SUPER_ADMIN
      if ( check_data.role == constant.ROLES.ADMIN || check_data.role == constant.ROLES.SUPER_ADMIN ) {
        if (check_data.phone != "") {
          const uniqueId = `${uuidv4()}${Date.now()}${check_data._id}`;

          const OTP = Math.floor(100000 + Math.random() * 900000);
          check_data.login_sms_otp_uid = uniqueId;
          check_data.login_sms_otp = OTP;
          check_data.webDeviceToken = webDeviceToken;

          if (mobile) {
            check_data.app_locale = locale
          } else {
            check_data.web_locale = locale
          }
         
          await check_data.save();


          sendSms({
            to: `+${check_data?.countryCode}${check_data.phone}`,
            message: res.__('userLogin.success.otpMessage', { first_name: check_data.first_name , last_name: check_data.last_name , OTP:OTP })
          });

          setTimeout(() => { removeOTPAfter5Minutes(uniqueId); }, 120 * 1000); // 120 seconds ( 2 minutes)
          
          return res.send({
                            code: CONSTANT.OTP_CODE,
                            message: res.__('userLogin.success.otpSent', { phone: check_data.phone.slice(-4)}),
                            uniqueId: uniqueId,
                            OTP: process.env.IS_SMS_FUNCTIONALITY_ACTIVE == `true` ? "" : OTP, // when it will be false then we will send OTP manually to frontend
                          });

        } else {

          return res.send({
                            code: CONSTANT.error_code,
                            message: res.__('userLogin.error.noPhoneLinked')
                          });
        }
      }

      
      // Update token
      if (deviceToken) {
        await Promise.all([
                            driver_model.updateMany({ deviceToken }, { deviceToken: null }),
                            user_model.updateMany({ deviceToken }, { deviceToken: null }),
                          ]);
      }

      let jwtToken = jwt.sign(
                              { 
                                userId: check_data._id,
                                companyPartnerAccess: false
                              },
                              process.env.JWTSECRET,
                              { expiresIn: "365d" }
                            );

      let setLocale = mobile ? { app_locale: locale } : { web_locale: locale }
      let updateData = {...setLocale}
      if (mobile) {
        updateData.jwtTokenMobile = jwtToken;
        updateData.lastUsedTokenMobile = new Date();
        updateData.app_locale = locale;
      } else {
        updateData.jwtToken = jwtToken;
        updateData.webDeviceToken = webDeviceToken;
        updateData.lastUsedToken = new Date();
        updateData.web_locale = locale;
      }
      if (deviceToken) {
        updateData.deviceToken = deviceToken;
      }

      
      // await check_data.save();
      await USER.findByIdAndUpdate( check_data._id, { $set: updateData }, { new: true });

      // Update device token in driver profile if compmany has driver account also
      if (check_data.isDriver) {
        

        let updateDriverdata =  {
                                    deviceToken,
                                    is_login: true,
                                    ...(mobile
                                      ? { app_locale: locale, lastUsedTokenMobile: new Date(), jwtTokenMobile: null }
                                      : { web_locale: locale, webDeviceToken, lastUsedToken: new Date(), jwtToken: null })
                                  };
        
        await DRIVER.updateOne(
                                {_id: check_data.driverId},
                                { $set: updateDriverdata }
                              )

        if (check_data?.driverId) { 
          // update driver cahce data
          updateDriverMapCache(check_data?.driverId); 
        }
      }
      
      let getData;
      if (check_data.role == constant.ROLES.HOTEL) {

        getData = await USER.aggregate([
          {
            $match: { _id: new mongoose.Types.ObjectId(check_data._id) },
          },
          {
            $lookup: {
              from: "users",
              localField: "created_by",
              foreignField: "_id",
              as: "company_detail",
            },
          },
          { $unwind: "$company_detail" },
        ]);
      } else {
        getData = await USER.aggregate([
          {
            $match: { _id: new mongoose.Types.ObjectId(check_data._id) },
          },
          {
            $lookup: {
              from: "agencies",
              localField: "_id",
              foreignField: "user_id",
              as: "company_detail",
            },
          },
          { $unwind: "$company_detail" },
        ]);
      }

      res.send({
        code: CONSTANT.success_code,
        message: res.__('userLogin.success.loginWelcome'),
        result: getData[0] ? getData[0] : check_data,
        jwtToken: jwtToken,
      });
    }
  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌ login error --------------' , err.message)
    return res.send({
      code: CONSTANT.error_code,
      message: err.message,
    });
  }
};

exports.appLogin = async (req, res) => {

  try {

    let data = req.body;

    if ( !data || typeof data?.email !== "string" || typeof data?.password !== "string" || typeof data?.platform !== "string") {
      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }

    if (data.email.length > 255 || data.password.length > 128 || data?.platform !== 'mobile') {

      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }
    
    const deviceToken = data.deviceToken;

    const normalizedEmail = data.email.trim().toLowerCase();

    const [checkCompany , checkDriver] = await Promise.all([
                        USER.findOne({
                                        email: normalizedEmail,
                                        is_deleted: false,
                                        is_blocked:false,
                                        role: CONSTANT.ROLES.COMPANY
                                      })
                                      .select("_id password isDriver driverId")
                                      .lean(),

                        DRIVER.findOne({
                                          email: normalizedEmail,
                                          is_deleted: false,
                                          is_blocked:false,
                                        })
                                        .select("_id password driver_company_id")
                                        .lean()
    ])

    if (!checkCompany && !checkDriver) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    const checkPassword = await bcrypt.compare( data.password, checkCompany ? checkCompany.password : checkDriver.password);

    if (!checkPassword) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    // Update token
    if (deviceToken) {
      await Promise.all([
                          DRIVER.updateOne({ deviceToken }, { $set: { deviceToken: null } }),
                          USER.updateOne({ deviceToken }, { $set: { deviceToken: null } }),
                        ]);
    }

    // if user has company rolee
    if (checkCompany) {

      let jwtToken = jwt.sign(
                              { 
                                userId: checkCompany._id,
                                companyPartnerAccess: false
                              },
                              process.env.JWTSECRET,
                              { expiresIn: CONSTANT.JWT_TOKEN_EXPIRE }
                            );

      const updateData = {
                          app_locale: locale,
                          jwtTokenMobile: jwtToken,
                          lastUsedTokenMobile: new Date(),
                          ...(deviceToken? {deviceToken} : {})
                        };

      await USER.findByIdAndUpdate(checkCompany._id , { $set: updateData});
    
      // Update device token in driver profile if compmany has driver account also
      if (checkCompany.isDriver) {
        

        let updateDriverdata =  {
                                    deviceToken,
                                    is_login: true,
                                    app_locale: locale, 
                                    lastUsedTokenMobile: new Date(), 
                                    jwtTokenMobile: null,
                                  };
        
        await DRIVER.updateOne(
                                {_id: checkCompany.driverId},
                                { $set: updateDriverdata }
                              )

        if (checkCompany?.driverId) { 
          // update driver cahce data
          updateDriverMapCache(checkCompany?.driverId); 
        }
      }

      const [companyDetails] = await USER.aggregate([
                                                      { $match: { _id: new mongoose.Types.ObjectId(checkCompany._id) } },
                                                      { $limit: 1 },

                                                      { $project: { 
                                                                    _id: 1,  
                                                                    email: 1,
                                                                    first_name: 1, 
                                                                    last_name: 1,
                                                                    user_name: 1,
                                                                    app_locale: 1,
                                                                    countryCode: 1, 
                                                                    phone: 1, 
                                                                    role: 1, 
                                                                    role: 1,
                                                                    is_deleted: 1,
                                                                    is_blocked: 1,
                                                                    is_special_plan_active: 1,
                                                                    commission:1,
                                                                    isSocketConnected:1,
                                                                    deviceToken:1,
                                                                    is_email_verified: 1,
                                                                    is_phone_verified: 1,
                                                                    isDriver: 1,
                                                                    driverId: 1,
                                                                    isDriverDeleted: 1,
                                                                    socketId: 1,
                                                                    favoriteDrivers: 1,
                                                                    company_account_access: 1,
                                                                    parnter_account_access: 1,
                                                                    settings: 1,
                                                                    status: 1 
                                                                  } 
                                                      },

                                                      {
                                                        $lookup: {
                                                          from: "agencies",
                                                          let: { userId: "$_id" },
                                                          pipeline: [
                                                            { $match: { $expr: { $eq: ["$user_id", "$$userId"] } } },
                                                            { $limit: 1 },
                                                            { $project: {  
                                                                          company_id: 1, 
                                                                          company_name: 1,
                                                                          p_number: 1,
                                                                        } 
                                                            },
                                                          ],
                                                          as: "company_detail",
                                                        },
                                                      },

                                                      { $unwind: { path: "$company_detail", preserveNullAndEmptyArrays: true } },
                                                    ]);

      if (!companyDetails) {
        return res.send({ code: CONSTANT.error_code, message: res.__('common.error.somethingWentWrong') });
      } 
      return res.send({
          code: CONSTANT.success_code,
          message: res.__('userLogin.success.loginWelcome'),
          result: companyDetails,
          jwtToken: jwtToken,
        });
    } else {

      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      ); // Set to Monday of current week

      const [completedTrips, totalUnpaidTrips, totalActiveTrips] = await Promise.all([

                                                                                        trip_model.countDocuments({
                                                                                                                    driver_name: checkDriver._id,
                                                                                                                    trip_status: CONSTANT.TRIP_STATUS.COMPLETED,
                                                                                                                    is_paid: false,
                                                                                                                  }),

                                                                                        trip_model.countDocuments({
                                                                                                                    driver_name: checkDriver._id,
                                                                                                                    trip_status: CONSTANT.TRIP_STATUS.COMPLETED,
                                                                                                                    is_paid: false,
                                                                                                                    drop_time: {
                                                                                                                      $lte: startOfCurrentWeek,
                                                                                                                    },
                                                                                                                  }),

                                                                                        trip_model.countDocuments({
                                                                                                                    driver_name: checkDriver._id,
                                                                                                                    trip_status: CONSTANT.TRIP_STATUS.ACTIVE,
                                                                                                                  })
                                                                                      ]);

      let jwtToken =  jwt.sign(
                                { 
                                  userId: checkDriver._id,
                                  companyPartnerAccess: false
                                },
                                process.env.JWTSECRET,
                                { expiresIn: CONSTANT.JWT_TOKEN_EXPIRE }
                              );

      const updateDriver = { 
                            is_login: true,
                            app_locale: locale,
                            jwtTokenMobile: jwtToken,
                            lastUsedTokenMobile: new Date(),
                            ...(deviceToken ? {deviceToken} : {}),
                          };

      let driverDetials = await DRIVER.findOneAndUpdate(
                                                        { _id: checkDriver._id },
                                                        { $set: updateDriver },
                                                        { 
                                                          new: true,
                                                          select: "_id first_name last_name app_locale companyName address_2 address_1 city country zip_code email countryCode phone favoriteDrivers deviceToken profile_image driver_documents gender is_available is_deleted is_blocked status driver_state currentTripId isVerified isBlocked isDocUploaded kyc is_login is_in_ride is_special_plan_active isSocketConnected socketId nickName isCompany isCompanyDeleted driver_company_id company_agency_id jwtTokenMobile defaultVehicle driverCounterId company_account_access parnter_account_access "
                                                        }
                                                      );

      if (driverDetials?.isCompany) {

        await USER.updateOne( { 
                                _id: checkDriver.driver_company_id }, 
                                { 
                                  $set: { 
                                          deviceToken: deviceToken , 
                                          app_locale: locale
                                        }
                                }
                            );
      }

      driverDetials = driverDetials.toObject();
      driverDetials.role = "DRIVER";
      driverDetials.totalTrips = completedTrips;
      driverDetials.totalUnpaidTrips = totalUnpaidTrips;
      driverDetials.totalActiveTrips = totalActiveTrips;

      // update driver cahce data
      updateDriverMapCache(checkDriver._id);

      return res.send({
                        code: CONSTANT.success_code,
                        message: res.__('userLogin.success.loginWelcome'),
                        result: driverDetials,
                        jwtToken: jwtToken,
                      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ app login error --------------' , err.message)
    return res.send({
                      code: CONSTANT.error_code,
                      message: res.__("common.error.somethingWentWrong"),
                    });
  }
}

exports.hotelWebLogin = async (req, res) => {

  try {

    let data = req.body;

    if ( !data || typeof data?.email !== "string" || typeof data?.password !== "string" || typeof data?.id !== "string") {
      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }

    if (data.email.length > 255 || data.password.length > 128 || data.id.length != 24) {

      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }

    if (!mongoose.Types.ObjectId.isValid(data.id)) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    const webDeviceToken = typeof data.webDeviceToken === "string" ? data.webDeviceToken.trim() : "";

    if (webDeviceToken && webDeviceToken.length > 4096) {
      return res.send({ code: CONSTANT.error_code, message: res.__("userLogin.error.incorrectCredentials") });
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    const hotelId = new mongoose.Types.ObjectId(data.id);
    const lang = (req.query.lang || "").toString().toLowerCase();
    const locale = CONSTANT.INTERNATIONALIZATION_LANGUAGE.ENGLISH === lang ? CONSTANT.INTERNATIONALIZATION_LANGUAGE.ENGLISH : CONSTANT.INTERNATIONALIZATION_LANGUAGE.DUTCH;
    
    const checkHotel = await USER.findOne({
                                              email: normalizedEmail,
                                              _id: hotelId,
                                              is_deleted: false,
                                              role: CONSTANT.ROLES.HOTEL,
                                              // status: true,
                                              is_blocked: false,
                                            }).
                                            select('_id password')
                                            .lean();

    if (!checkHotel) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    const checkPassword = await bcrypt.compare( data.password, checkHotel.password);

    if (!checkPassword) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    let jwtToken = jwt.sign(
                              { 
                                userId: hotelId,
                                companyPartnerAccess: false
                              },
                              process.env.JWTSECRET,
                              { expiresIn: CONSTANT.JWT_TOKEN_EXPIRE }
                            );

    const updateData = {
                          web_locale: locale,
                          jwtToken: jwtToken,
                          ...(webDeviceToken ? { webDeviceToken } : {}),
                          lastUsedToken: new Date()
                        };

    await USER.findByIdAndUpdate( hotelId, { $set: updateData });

    const [hotelDetails] = await USER.aggregate([
                                                {
                                                  $match: { _id: hotelId },
                                                },

                                                // 🔹 lookup company (created_by user)
                                                {
                                                  $lookup: {
                                                    from: "users",
                                                    localField: "created_by",
                                                    foreignField: "_id",
                                                    as: "company_detail",
                                                    pipeline: [
                                                      { $limit: 1 },
                                                      {
                                                        $project: {
                                                          _id: 1,
                                                          first_name: 1,
                                                          last_name: 1,
                                                          email: 1,
                                                          phone: 1,
                                                          user_name:1,
                                                          countryCode:1,
                                                          logo:1,
                                                          settings:1,
                                                        },
                                                      },
                                                    ],
                                                  },
                                                },
                                                {
                                                  $unwind: {
                                                    path: "$company_detail",
                                                    preserveNullAndEmptyArrays: true,
                                                  },
                                                },

                                                // 🔹 select only required hotel + company fields
                                                {
                                                  $project: {
                                                    _id: 1,
                                                    first_name: 1,
                                                    last_name: 1,
                                                    email: 1,
                                                    phone: 1,
                                                    logo:1,
                                                    is_deleted:1,
                                                    is_blocked:1,
                                                    status:1,
                                                    is_email_verified:1,
                                                    is_phone_verified:1,
                                                    jwtToken:1,
                                                    countryCode:1,
                                                    role: 1,
                                                    user_name:1,
                                                    web_locale:1,
                                                    company_detail: 1, // 👈 nested company info
                                                  },
                                                },
                                                { $limit: 1 },
                                              ]);

    if (!hotelDetails) {
      return res.send({ code: CONSTANT.error_code, message: res.__('common.error.somethingWentWrong') });
    }    
    return res.send({
                      code: CONSTANT.success_code,
                      message: res.__('userLogin.success.loginWelcome'),
                      result: hotelDetails,
                      jwtToken: jwtToken,
                    });

  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌ hotelWebLogin error --------------' , err.message)
    return res.send({ code: CONSTANT.error_code, message: res.__('common.error.somethingWentWrong') });
  }
}

exports.driverWebLogin = async (req, res) => {

  try {

    let data = req.body;

    if ( !data || typeof data?.email !== "string" || typeof data?.password !== "string") {
      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }

    if (data.email.length > 255 || data.password.length > 128) {

      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }

    const webDeviceToken = typeof data.webDeviceToken === "string" ? data.webDeviceToken.trim() : "";

    if (webDeviceToken && webDeviceToken.length > 4096) {
      return res.send({ code: CONSTANT.error_code, message: res.__("userLogin.error.incorrectCredentials") });
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    const lang = (req.query.lang || "").toString().toLowerCase();
    const locale = CONSTANT.INTERNATIONALIZATION_LANGUAGE.ENGLISH === lang ? CONSTANT.INTERNATIONALIZATION_LANGUAGE.ENGLISH : CONSTANT.INTERNATIONALIZATION_LANGUAGE.DUTCH;
    

    const checkDriver = await DRIVER.findOne({
                                              email: normalizedEmail,
                                              is_deleted: false,
                                              // status: true,
                                              is_blocked: false,
                                            }).
                                            select('_id password')
                                            .lean();

    if (!checkDriver) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    const checkPassword = await bcrypt.compare( data.password, checkDriver.password);

    if (!checkPassword) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    if (webDeviceToken) {
      await Promise.all([
                          DRIVER.updateOne({ webDeviceToken }, { $set: { webDeviceToken: null } }),
                          USER.updateOne({ webDeviceToken }, { $set: { webDeviceToken: null } }),
                        ]);
    }

    let currentDate = new Date();
    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(
      startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
    ); // Set to Monday of current week

    const [completedTrips, totalUnpaidTrips, totalActiveTrips] = await Promise.all([

                                                                                        trip_model.countDocuments({
                                                                                                                    driver_name: checkDriver._id,
                                                                                                                    trip_status: CONSTANT.TRIP_STATUS.COMPLETED,
                                                                                                                    is_paid: false,
                                                                                                                  }),

                                                                                        trip_model.countDocuments({
                                                                                                                    driver_name: checkDriver._id,
                                                                                                                    trip_status: CONSTANT.TRIP_STATUS.COMPLETED,
                                                                                                                    is_paid: false,
                                                                                                                    drop_time: {
                                                                                                                      $lte: startOfCurrentWeek,
                                                                                                                    },
                                                                                                                  }),

                                                                                        trip_model.countDocuments({
                                                                                                                    driver_name: checkDriver._id,
                                                                                                                    trip_status: CONSTANT.TRIP_STATUS.ACTIVE,
                                                                                                                  })
                                                                                      ]);

    let jwtToken =  jwt.sign(
                              { 
                                userId: checkDriver._id,
                                companyPartnerAccess: false
                              },
                              process.env.JWTSECRET,
                              { expiresIn: CONSTANT.JWT_TOKEN_EXPIRE }
                            );

    const updateDriver = { 
                            // is_login: true,
                            web_locale: locale,
                            jwtToken: jwtToken,
                            lastUsedToken: new Date(),
                            ...(webDeviceToken ? {webDeviceToken} : {}),
                          };

    let driverDetials = await DRIVER.findOneAndUpdate(
                                                        { _id: checkDriver._id },
                                                        { $set: updateDriver },
                                                        { 
                                                          new: true,
                                                          select: "_id first_name last_name app_locale companyName address_2 address_1 city country zip_code email countryCode phone favoriteDrivers deviceToken profile_image driver_documents gender is_available is_deleted is_blocked status driver_state currentTripId isVerified isBlocked isDocUploaded kyc is_login is_in_ride is_special_plan_active isSocketConnected socketId nickName isCompany isCompanyDeleted driver_company_id company_agency_id jwtTokenMobile defaultVehicle driverCounterId company_account_access parnter_account_access "
                                                        }
                                                      );

    if (driverDetials?.isCompany) {

      await USER.updateOne( { 
                              _id: checkDriver.driver_company_id }, 
                              { 
                                $set: { 
                                        webDeviceToken: webDeviceToken , 
                                        web_locale: locale
                                      }
                              }
                          );
    }

    driverDetials = driverDetials.toObject();
    driverDetials.role = "DRIVER";
    driverDetials.totalTrips = completedTrips;
    driverDetials.totalUnpaidTrips = totalUnpaidTrips;
    driverDetials.totalActiveTrips = totalActiveTrips;

    // update driver cahce data
    updateDriverMapCache(checkDriver._id);

    return res.send({
                      code: CONSTANT.success_code,
                      message: res.__('userLogin.success.loginWelcome'),
                      result: driverDetials,
                      jwtToken: jwtToken,
                    });

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌ driverWebLogin error --------------' , error.message)
    res.send({
      code: CONSTANT.error_code,
      message: res.__('common.error.somethingWentWrong')
    })
  }
}

exports.companyWebLogin = async (req, res) => {

  try {

    let data = req.body;

    if ( !data || typeof data?.email !== "string" || typeof data?.password !== "string") {
      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }

    if (data.email.length > 255 || data.password.length > 128) {

      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('userLogin.error.incorrectCredentials'),
                      });
    }

    const webDeviceToken = typeof data.webDeviceToken === "string" ? data.webDeviceToken.trim() : "";

    if (webDeviceToken && webDeviceToken.length > 4096) {
      return res.send({ code: CONSTANT.error_code, message: res.__("userLogin.error.incorrectCredentials") });
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    const lang = (req.query.lang || "").toString().toLowerCase();
    const locale = CONSTANT.INTERNATIONALIZATION_LANGUAGE.ENGLISH === lang ? CONSTANT.INTERNATIONALIZATION_LANGUAGE.ENGLISH : CONSTANT.INTERNATIONALIZATION_LANGUAGE.DUTCH;
    
    const checkCompany = await USER.findOne({
                                              email: normalizedEmail,
                                              is_deleted: false,
                                              role: CONSTANT.ROLES.COMPANY,
                                              // status: true,
                                              is_blocked: false,
                                            }).
                                            select('_id password isDriver driverId')
                                            .lean();

    if (!checkCompany) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    const checkPassword = await bcrypt.compare( data.password, checkCompany.password);

    if (!checkPassword) {
      return res.send({ code: CONSTANT.error_code, message: res.__('userLogin.error.incorrectCredentials') });
    }

    if (webDeviceToken) {
      await Promise.all([
                          DRIVER.updateOne({ webDeviceToken }, { $set: { webDeviceToken: null } }),
                          USER.updateOne({ webDeviceToken }, { $set: { webDeviceToken: null } }),
                        ]);
    }

    let jwtToken = jwt.sign(
                              { 
                                userId: checkCompany._id,
                                companyPartnerAccess: false
                              },
                              process.env.JWTSECRET,
                              { expiresIn: CONSTANT.JWT_TOKEN_EXPIRE }
                            );

    const updateData = {
                          web_locale: locale,
                          jwtToken: jwtToken,
                          lastUsedToken: new Date(),
                          ...(webDeviceToken? {webDeviceToken} : {})
                        };

    await USER.findByIdAndUpdate(checkCompany._id , { $set: updateData});
  
    // Update device token in driver profile if compmany has driver account also
      if (checkCompany.isDriver) {
        

        let updateDriverdata =  {
                                    ...(webDeviceToken ? {webDeviceToken} : {}),
                                    // is_login: true,
                                    web_locale: locale, 
                                    lastUsedToken: new Date(), 
                                    jwtTokenMobile: null,
                                  };
        
        await DRIVER.updateOne(
                                {_id: checkCompany.driverId},
                                { $set: updateDriverdata }
                              )

        if (checkCompany?.driverId) { 
          // update driver cahce data
          updateDriverMapCache(checkCompany?.driverId); 
        }
      }

      const [companyDetails] = await USER.aggregate([
                                                      { $match: { _id: new mongoose.Types.ObjectId(checkCompany._id) } },
                                                      { $limit: 1 },

                                                      { $project: { 
                                                                    _id: 1,  
                                                                    email: 1,
                                                                    first_name: 1, 
                                                                    last_name: 1,
                                                                    user_name: 1,
                                                                    app_locale: 1,
                                                                    countryCode: 1, 
                                                                    phone: 1, 
                                                                    role: 1, 
                                                                    role: 1,
                                                                    is_deleted: 1,
                                                                    is_blocked: 1,
                                                                    is_special_plan_active: 1,
                                                                    commission:1,
                                                                    isSocketConnected:1,
                                                                    deviceToken:1,
                                                                    is_email_verified: 1,
                                                                    is_phone_verified: 1,
                                                                    isDriver: 1,
                                                                    driverId: 1,
                                                                    isDriverDeleted: 1,
                                                                    socketId: 1,
                                                                    favoriteDrivers: 1,
                                                                    company_account_access: 1,
                                                                    parnter_account_access: 1,
                                                                    settings: 1,
                                                                    status: 1 
                                                                  } 
                                                      },

                                                      {
                                                        $lookup: {
                                                          from: "agencies",
                                                          let: { userId: "$_id" },
                                                          pipeline: [
                                                            { $match: { $expr: { $eq: ["$user_id", "$$userId"] } } },
                                                            { $limit: 1 },
                                                            { $project: {  
                                                                          company_id: 1, 
                                                                          company_name: 1,
                                                                          p_number: 1,
                                                                        } 
                                                            },
                                                          ],
                                                          as: "company_detail",
                                                        },
                                                      },

                                                      { $unwind: { path: "$company_detail", preserveNullAndEmptyArrays: true } },
                                                    ]);

      if (!companyDetails) {
        return res.send({ code: CONSTANT.error_code, message: res.__('common.error.somethingWentWrong') });
      } 
      
      return res.send({
                        code: CONSTANT.success_code,
                        message: res.__('userLogin.success.loginWelcome'),
                        result: companyDetails,
                        jwtToken: jwtToken,
                      });

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌ companyWebLogin error --------------' , error.message)
    res.send({
      code: CONSTANT.error_code,
      message: res.__('common.error.somethingWentWrong')
    })
  }
}

exports.hotelContextCompany = async (req , res) => {

  try {

    
    let data = req.body;

    if (!data?.id || typeof data?.id !== "string" || data?.id.length != 24) {
      return res.send({
                        code: CONSTANT.error_code,
                        message: res.__('common.error.somethingWentWrong'),
                      });
    }

    if (!mongoose.Types.ObjectId.isValid(data.id)) {
      return res.send({ code: CONSTANT.error_code, message: res.__('common.error.somethingWentWrong') });
    }

    const hotelId = new mongoose.Types.ObjectId(data.id);
    const t0 = Date.now();
    const checkHotel = await USER.findOne({
                                            _id: hotelId,
                                            is_deleted: false,
                                            role: CONSTANT.ROLES.HOTEL,
                                            // status: true,
                                            is_blocked: false,
                                            })
                                            .populate({
                                              path: "created_by",          // make sure this matches schema field
                                              select: "first_name last_name logo phone countryCode role",
                                            })
                                            .select("_id created_by") 
                                            .lean();
    console.log("hotelContextCompany query ms:", Date.now() - t0 );
     if (!checkHotel) {
      return res.send({ code: CONSTANT.error_code, message: res.__('common.error.somethingWentWrong') });
    }

    return res.send({
                      code: CONSTANT.success_code,
                      result: checkHotel?.created_by || null,
                    });
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌ hotelContextCompany error --------------' , error.message)
    res.send({
      code: CONSTANT.error_code,
      message: res.__('common.error.somethingWentWrong')
    })
  }
}

exports.getIosAppVersion = async (req, res) => {
  const appId = 6476204096;
  const url = `https://itunes.apple.com/lookup?id=${appId}`;
  try {

    const response = await axios.get(url);
    const data = response.data;
    res.send({
      code: CONSTANT.success_code,
      message: data.results[0].version
    });
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌ get ISO app version error --------------' , error.message)
    res.send({
      code: CONSTANT.error_code,
      message: res.__('userLogin.error.appVersionNotFound')
    });
  }
}
exports.login_otp_verify = async (req, res) => {
  try {
    let data = req.body;
    const deviceToken = data.deviceToken;
    const check_data = await USER.findOne({
      login_sms_otp_uid: data.login_sms_otp_uid,
    });

    if (check_data) {
      if (check_data.login_sms_otp == data.otp) {
        // Update token
        if (deviceToken) {
          await Promise.all([
            driver_model.updateMany({ deviceToken }, { deviceToken: null }),
            user_model.updateMany({ deviceToken }, { deviceToken: null }),
          ]);
        }

        let jwtToken = jwt.sign(
          { 
            userId: check_data._id,
            companyPartnerAccess: false
          },
          process.env.JWTSECRET,
          { expiresIn: "365d" }
        );

        check_data.jwtToken = jwtToken;
        check_data.lastUsedToken = new Date();
        check_data.login_sms_otp = "";
        check_data.login_sms_otp_uid = "";

        if (deviceToken) check_data.deviceToken = deviceToken;

        await check_data.save();

        let getData = await USER.aggregate([
          {
            $match: { _id: new mongoose.Types.ObjectId(check_data._id) },
          },
          {
            $lookup: {
              from: "agencies",
              localField: "_id",
              foreignField: "user_id",
              as: "company_detail",
            },
          },
          { $unwind: "$company_detail" },
        ]);

        return res.send({
          code: CONSTANT.success_code,
          message: res.__('userLogin.success.loginWelcome'),
          result: getData[0] ? getData[0] : check_data,
          jwtToken: jwtToken,
        });
      } else {
        return res.send({
          code: CONSTANT.error_code,
          message: res.__('loginOtpVerify.error.invalidOtp')
        });
      }
      res.send({
        code: CONSTANT.success_code,
        message: user,
      });
    } else {
      return res.send({
        code: CONSTANT.error_code,
        message: res.__('loginOtpVerify.error.requestExpired')
      });
    }
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌ login otp verify error --------------' , error.message)
    return res.send({
        code: CONSTANT.error_code,
        message: error.message,
      });
  }
};

exports.resend_login_otp = async (req, res) => {
  try {
    let data = req.body;

    const check_data = await USER.findOne({
      login_sms_otp_uid: data.login_sms_otp_uid,
    });

    if (check_data) {
      if (
        check_data.role == constant.ROLES.ADMIN ||
        check_data.role == constant.ROLES.SUPER_ADMIN
      ) {
        if (check_data.phone != "") {
          const uniqueId = `${uuidv4()}${Date.now()}${check_data._id}`;

          const OTP = Math.floor(100000 + Math.random() * 900000);
          check_data.login_sms_otp_uid = uniqueId;
          check_data.login_sms_otp = OTP;
          await check_data.save();
          sendSms({
            to: `+${check_data?.countryCode}${check_data.phone}`,
            message: res.__('userLogin.success.otpMessage' , {first_name: check_data.first_name , last_name: check_data.last_name, OTP:OTP})
          });

          setTimeout(() => {
            removeOTPAfter5Minutes(uniqueId);
          }, 120 * 1000); // 120 seconds ( 2 minutes)

          return res.send({
            code: CONSTANT.OTP_CODE,
            message: res.__('userLogin.success.otpSent' , {phone: check_data.phone.slice(-4)}),
            OTP: process.env.IS_SMS_FUNCTIONALITY_ACTIVE == `true` ? "" : OTP, // when it will be false then we will send OTP manually to frontend,
            uniqueId: uniqueId,
          });
        } else {
          return res.send({
            code: CONSTANT.error_code,
            message:res.__('userLogin.error.noPhoneLinked'),
          });
        }
      } else {
        return res.send({
          code: CONSTANT.error_code,
          message: res.__('loginOtpVerify.error.roleValidationFailed'),
        });
      }
    } else {
      return res.send({
        code: CONSTANT.error_code,
        message: res.__('loginOtpVerify.error.requestExpired')
      });
    }
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌ resend login otp error --------------' , error.message)
    res.send({
      code: CONSTANT.error_code,
      message: error.message,
    });
  }
};

exports.get_token_detail = async (req, res) => {
  try {
    let currentDate = new Date();
    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(
      startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
    ); // Set to Monday of current week
    let data = req.body;

   
    let result1;
    const userByID = await USER.findOne({ _id: req.userId }).populate("driverId");
    const userPurchasedPlans = await getUserActivePaidPlans(req.user);
    
    let lookupData  = {
                        from: "agencies",
                        localField: "_id",
                        foreignField: "user_id",
                        as: "company_detail",
                      };

    let agencyLookupData=  null

    if (req.user.role == constant.ROLES.HOTEL) {
      
      lookupData.from = 'users';
      lookupData.localField = 'created_by';
      lookupData.foreignField = '_id';

      agencyLookupData = {
                            from: "agencies",
                            localField: "_id",
                            foreignField: "user_id",
                            as: "agency_detail",
                        }
    }

    // Build aggregation pipeline
    let pipeline =  [
                      { $match: { _id: new mongoose.Types.ObjectId(req.userId) } },
                      { $lookup: lookupData },
                      { $unwind: { path: "$company_detail", preserveNullAndEmptyArrays: true } }, // Single object
                    ];

    // Add agency lookup only if needed
    if (agencyLookupData) {
      pipeline.push(
        { $lookup: agencyLookupData },
        { $unwind: { path: "$agency_detail", preserveNullAndEmptyArrays: true } } // Ensure single object
      );
    }

    pipeline.push(
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: { path: "$company_detail", preserveNullAndEmptyArrays: true } }
    );

    let getData = await USER.aggregate(pipeline);

    if (!userByID) {
      let get_data = await DRIVER.findOne({ _id: req.userId });

      if (!get_data) {

        return res.send({
                          code: CONSTANT.error_code,
                          message: res.__('getTokenDetail.error.unableToFetchDetail'),
                        });
        
      }
      const totalUnpaidTrips = await trip_model.find({
                                                      driver_name: get_data._id,
                                                      trip_status: "Completed",
                                                      is_paid: false,
                                                      drop_time: {
                                                        $lte: startOfCurrentWeek,
                                                      },
                                                    })
                                                    .countDocuments();

      let get_data2 = get_data.toObject();
      get_data2.totalUnpaidTrips = totalUnpaidTrips;
      get_data2.role = "DRIVER";
      get_data2.plan_access_status = userPurchasedPlans.length > 0 ? true : false;
      

      return res.send({
                        code: constant.success_code,
                        message: res.__('getTokenDetail.success.informationRetrieved'),
                        result: get_data2,
                      });
    } else {
      let dataResult = getData[0];
      // const dataModified = dataResult.toObject();
      const drivers = dataResult?.driver || [];
      const driverData = drivers[0];
      if (driverData) {
        dataResult.driver = driverData;
      }

      if (dataResult) {
        dataResult.plan_access_status = userPurchasedPlans.length > 0 ? true : false;
        let driverPurchasedPlans = await getUserActivePaidPlans(dataResult?.driver);
        dataResult.driver.plan_access_status = driverPurchasedPlans.length > 0 ? true : false;

      } else {

        userByID.plan_access_status = userPurchasedPlans.length > 0 ? true : false;
        let driverPurchasedPlans = await getUserActivePaidPlans(dataResult?.driverId);
        userByID.driverId.plan_access_status = driverPurchasedPlans.length > 0 ? true : false;
      }
      
      return res.send({
                        code: constant.success_code,
                        message: res.__('getTokenDetail.success.informationRetrieved'),
                        result: dataResult ? dataResult : userByID,
                      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ get token details error --------------' , err.message)
    return  res.send({
                      code: CONSTANT.error_code,
                      message: err.message,
                    });
  }
};

exports.getCompanyDetail = async (req , res) => {

  try {

    const compnayId = req.body.companyId;
    const companyDetail = await USER.findById(compnayId).populate("driverId");
    if (!companyDetail) {
      res.send({
                code: CONSTANT.error_code,
                message: res.__('addSubAdmin.error.invalidCompany'),
              });
    }

    return res.send({
                        code: constant.success_code,
                        message: res.__('getTokenDetail.success.informationRetrieved'),
                        result: companyDetail,
                      });
    
  } catch (error) {
    console.log("❌❌❌❌❌❌❌❌❌🚀 ~ exports.getCompanyDetail= ~ err:", error.message);
    res.send({
      code: CONSTANT.error_code,
      message: error.message,
    });
  }
}
exports.send_otp = async (req, res) => {
  try {

    const { email } = req.body;

    // 1️⃣ Validate input
    if (!email || typeof email !== "string") {
      return res.send({
        code: constant.error_code,
        message: res.__("sendOtp.error.invalidInput"),
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2️⃣ Find user or driver
    let account =
      (await USER.findOne({ email: normalizedEmail, status: true, is_deleted: false, })) ||
      (await DRIVER.findOne({ email: normalizedEmail, is_deleted: false, }));

    // 3️⃣ Account not found
    if (!account) {
      return res.send({
        code: constant.error_code,
        message: res.__("sendOtp.error.invalidInput"),
      });
    }

    // 4️⃣ Blocked check
    if (account.is_blocked) {
      return res.send({
        code: constant.error_code,
        message: res.__("userLogin.error.accessRestricted"),
      });
    }

    const OTP = randToken.generate(4, "123456789");
    const otp_expiry = new Date(Date.now() + 60 * 1000); // 1 minute

    // 6️⃣ Update only required fields
    await account.updateOne({ OTP, otp_expiry });

    // 7️⃣ Send email (non-blocking)
    try {
      await passwordResetOtpEmail(account, OTP);
    } catch (mailErr) {
      console.error("OTP email failed:", mailErr.message);
    }

     // 8️⃣ Success response
    return res.send({
      code: constant.success_code,
      message: res.__("sendOtp.success.otpSentToEmail"),
    });


    let data = req.body;
    let check_email = await USER.findOne({
      $and: [
        {
          $or: [
            { email: normalizedEmail }, // Exact match
            // { phone: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
          ],
        },
        {
          status: true,
        },
        {
          is_deleted: false,
        },
      ],
    });
    if (!check_email) {

      

      let check_driver = await DRIVER.findOne({
        $and: [
          {
            $or: [
              { email: normalizedEmail }, // Exact match
              // { phone: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
            ],
          },
          {
            is_deleted: false,
          },
        ],
      });
      
      if (!check_driver) {
        res.send({
          code: constant.error_code,
          message: res.__('sendOtp.error.invalidInput'),
        });
        return;
      }

      if (check_driver.is_blocked) {
        return res.send({
                      code: constant.error_code,
                      message: res.__('userLogin.error.accessRestricted'),
                    });
      }
      data.OTP = randToken.generate(4, "123456789");
      data.otp_expiry = moment().add("minutes", 1).format();
      let updateUser = await DRIVER.findOneAndUpdate(
                                                      { _id: check_driver._id },
                                                      data,
                                                      { new: true }
                                                    );

      passwordResetOtpEmail(check_driver , data.OTP)
      
      res.send({
        code: constant.success_code,
        message: res.__('sendOtp.success.otpSentToEmail'),
      });
    } else {

      if (check_email.is_blocked) {
        return res.send({
                      code: constant.error_code,
                      message: res.__('userLogin.error.accessRestricted'),
                    });
      }

      data.OTP = randToken.generate(4, "123456789");
      data.otp_expiry = moment().add("minutes", 1).format();
      let updateUser = await USER.findOneAndUpdate(
        { _id: check_email._id },
        data,
        { new: true }
      );
      if (!updateUser) {
        res.send({
          code: constant.error_code,
          message: res.__('sendOtp.error.otpSendFailed'),
        });
      } else {
        passwordResetOtpEmail(check_email , data.OTP)
        
        res.send({
          code: constant.success_code,
          message: res.__('sendOtp.success.otpSentToEmail'),
        });
      }
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ send OTP error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.verify_otp = async (req, res) => {
  try {

    const { email, OTP } = req.body;

    // Validate input
    if (!email || !OTP) {
      return res.send({
        code: constant.error_code,
        message: res.__('loginOtpVerify.error.invalidRequest'),
      });
    }

    if (!email || typeof email !== "string") {
      return res.send({
        code: constant.error_code,
        message: res.__("sendOtp.error.invalidInput"),
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const account =
      (await USER.findOne({ email: normalizedEmail })) ||
      (await DRIVER.findOne({ email: normalizedEmail }));

    if (!account) {
      return res.send({
        code: constant.error_code,
        // message: res.__('loginOtpVerify.error.invalidEmail'),
        message: res.__("sendOtp.error.invalidInput"),
      });
    }

    // Normalize OTP comparison
    if (String(OTP) !== String(account.OTP)) {
      return res.send({
        code: constant.error_code,
        // message: res.__('loginOtpVerify.error.invalidOtp'),
        message: res.__("sendOtp.error.invalidInput")
      });
    }

    await account.updateOne({ OTP: null });

    return res.send({
      code: constant.success_code,
      message: res.__('loginOtpVerify.success.otpVerified'),
    });

  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌ verify otp error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.forgot_password = async (req, res) => {
  try {
    let data = req.body;
     if (!data.email || typeof data.email !== "string") {
      return res.send({
        code: constant.error_code,
        message: res.__("sendOtp.error.invalidInput"),
      });
    }
    
    const normalizedEmail = data.email.trim().toLowerCase();
    let criteria = { email: normalizedEmail };
    let check_email = await USER.findOne(criteria);
    if (!check_email) {
      let check_driver = await DRIVER.findOne(criteria);

      
      if (!check_driver) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('forgot_password.error.emailNotFound'),
                        });
        
      }
      let option = { new: true };
      let hash = bcrypt.hashSync(data.password, 10);
      let newValue = { $set: { password: hash, stored_password: data.password, OTP: "",  }, };

      let updatePassword = await DRIVER.findOneAndUpdate( criteria, newValue, option);

      if (check_driver.isCompany == true && check_driver.driver_company_id) {

        await DRIVER.findOneAndUpdate({_id: check_driver.driver_company_id},{ $set: { password: hash, stored_password: data.password  }, },option);
      }
      if (!updatePassword) {
        res.send({
                  code: constant.error_code,
                  message: res.__('forgot_password.error.passwordUpdateFailed'),
                });
      } else {
        res.send({
                  code: constant.success_code,
                  message: res.__('forgot_password.success.passwordUpdated'),
                });
      }
    } else {

      let option = { new: true };
      let hash = bcrypt.hashSync(data.password, 10);
      let newValue = {
        $set: {
          password: hash,
          stored_password: data.password,
          OTP: "",
        },
      };

      let updatePassword = await USER.findOneAndUpdate(criteria,newValue,option);

      if (check_email.isDriver == true && check_email.driverId) {

        await DRIVER.findOneAndUpdate({_id: check_email.driverId},{ $set: { password: hash, stored_password: data.password  }, },option);
      }

      if (!updatePassword) {
        res.send({
          code: constant.error_code,
          message: res.__('forgot_password.error.passwordUpdateFailed'),
        });
      } else {
        res.send({
          code: constant.success_code,
          message: res.__('forgot_password.success.passwordUpdated'),
        });
      }
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ forgot password error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.reset_password = async (req, res) => {
  try {
    let data = req.body;
    let option = { new: true };
    let check_email = await USER.findOne({ _id: req.userId });
    if (!check_email) {

      let check_driver = await DRIVER.findOne({ _id: req.userId });

      
      if (!check_driver) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('resetPassword.error.userNotFound'),
                        });
      } else {

        let comparePassword = await bcrypt.compare(data.oldPassword,check_driver.password);

        if (!comparePassword) {
          return res.send({
                            code: constant.error_code,
                            message: res.__('resetPassword.error.incorrectOldPassword'),
                          });
        } 

        let hashedPassword = await bcrypt.hashSync(data.password, 10);
        let newValue = {
                          $set: {
                            stored_password : data.password,
                            password: hashedPassword,
                          },
                        };
        
        await DRIVER.findOneAndUpdate(criteria,newValue,option);

        if (check_driver.isCompany && check_driver.driver_company_id) {
          
          await USER.findOneAndUpdate({_id: check_driver.driver_company_id}, newValue ,option);
        }
      }
      
    } else {

      let comparePassword = await bcrypt.compare(
                                                  data.oldPassword,
                                                  check_email.password
                                                );
      if (!comparePassword) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('resetPassword.error.incorrectOldPassword'),
                        });
      } else {

        let hashedPassword = await bcrypt.hashSync(data.password, 10);
        let newValue = {
          $set: {
            stored_password : data.password,
            password: hashedPassword,
          },
        };
        let criteria = { _id: req.userId };
        let updateUser = await USER.findOneAndUpdate(criteria,newValue,option);

        if (check_email.isDriver && check_email.driverId) {
          
          await DRIVER.findOneAndUpdate({_id: check_email.driverId}, newValue ,option);
        }
        if (!updateUser) {
          return res.send({
                            code: constant.error_code,
                            message: res.__('resetPassword.error.passwordUpdateFailed'),
                          });
        } else {
          return res.send({
                          code: constant.success_code,
                          message: res.__('resetPassword.success.passwordReset'),
                        });
        }
      }
    }
  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌ reset password error --------------' , err.message)
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.save_feedback = async (req, res) => {
  try {
    let data = req.body;
    data.user_id = req.userId;
    let save_data = await FEEDBACK(data).save();
    if (!save_data) {
      res.send({
        code: constant.error_code,
        message: res.__('saveFeedback.error.saveFailed'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('saveFeedback.success.feedbackSaved'),
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ save feedback error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_feedback = async (req, res) => {
  try {
    let data = req.body;
    let get_feedbacks = await FEEDBACK.aggregate([
      {
        $lookup: {
          from: "users",
          localField: "user_id",
          foreignField: "_id",
          as: "user",
          pipeline: [
            {
              $lookup: {
                from: "agencies",
                localField: "_id",
                foreignField: "user_id",
                as: "company_detail",
              },
            },
            {
              $project: {
                company_name: {
                  $arrayElemAt: ["$company_detail.company_name", 0],
                },
              },
            },
          ],
        },
      },
      {
        $project: {
          _id: 1,
          createdAt: 1,
          comment: 1,
          title: 1,
          company_name: { $arrayElemAt: ["$user.company_name", 0] },
        },
      },
    ]).sort({ createdAt: -1 });
    res.send({
      code: constant.success_code,
      message: res.__('getFeedback.success.feedbackRetrieved'),
      result: get_feedbacks,
    });
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ get feedback error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.createPaymentSession = async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            // To accept `ideal`, all line items must have currency: eur
            currency: "inr",
            product_data: {
              name: "T-shirt",
            },
            unit_amount: 2000,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: "http://localhost:3000//success",
      cancel_url: "http://localhost:3000//cancel",
    });
    res.send({
      code: constant.success_code,
      message: "Success",
      result: session,
    });
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ create paymemr session error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};
