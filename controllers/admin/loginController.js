require("dotenv").config();
const { default: axios } = require("axios");
const constants = require("../../config/constant");
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
const emailConstant = require("../../config/emailConstant");
const nodemailer = require("nodemailer");
const stripe = require("stripe")(
  "sk_test_51OH1cSSIpj1PyQQaTWeLDPcDsiROliXqsb2ROV2SvHEXwIBbnM9doAQF4rIqWGTTFM7SK4kBxjMmSXMgcLcJTSVh00l0kUa708"
);
const { getUserActivePaidPlans , getUserCurrentActivePayedPlan , } = require("../../Service/helperFuntion");

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
    console.error("Error updating user:", error);
  }
};

exports.create_super_admin = async (req, res) => {
  try {
    let data = req.body;
    let checkEmail = await USER.findOne({ email: data.email });
    if (checkEmail) {
      res.send({
        code: constants.error_code,
        message: res.__('createSuperAdmin.error.emailAlreadyInUse'),
      });
      return;
    }
    let checkPhone = await USER.findOne({ phone: data.phone });
    if (checkPhone) {
      res.send({
        code: constants.error_code,
        message: res.__('createSuperAdmin.error.phoneAlreadyInUse'),
      });
      return;
    }
    let hash = await bcrypt.hashSync(data.password, 10);
    data.password = hash;
    let save_data = await USER(data).save();
    if (!save_data) {
      res.send({
        code: constants.error_code,
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
        code: constants.success_code,
        message: res.__('createSuperAdmin.success.accountCreated'),
        result: save_data,
      });
    }
  } catch (err) {
    res.send({
      code: constants.error_code,
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
    const mobile = data?.platform == "mobile";

    let check_data;
    let userData = await USER.findOne({
                                        $and: [
                                          {
                                            $or: [
                                              { email: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
                                              { phone: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
                                            ],
                                          },
                                          {
                                            is_deleted: false,
                                          },
                                        ],
                                      })


    // If user is blocked by admin or super admin
    if (userData && userData.role != "SUPER_ADMIN" && (userData?.is_blocked) ) {

      if ( userData.role != constants.ROLES.COMPANY) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accessRestricted')
                        });
      } else if (userData?.role == constants.ROLES.COMPANY && userData?.isDriver == false){
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accessRestricted')
                        });
      } else {}
      
    }else if (userData?.role == constants.ROLES.HOTEL) {

      let hotelCreatedBy = await USER.findOne({_id: userData.created_by})

      if (hotelCreatedBy?.is_blocked) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.companyAccessRestricted')
           });
      }
    }

    // drver login code
    if (!userData || (userData?.role == constants.ROLES.COMPANY &&  userData?.isDriver == true && userData?.is_blocked == true)) {

      
      let check_again = await DRIVER.findOne({
                                              $and: [
                                                {
                                                  $or: [
                                                    { email: { $regex: data.email, $options: "i" } },
                                                    { phone: { $regex: data.email, $options: "i" } },
                                                  ],
                                                },
                                                {
                                                  is_deleted: false,
                                                },
                                              ],
                                            });
      

      if (!check_again) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.incorrectCredentials'),
                        });
      }

      if (check_again?.is_blocked){
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accessRestricted')
                        });
      }

      const completedTrips = await trip_model.find({
                                                    driver_name: check_again._id,
                                                    trip_status: "Completed",
                                                    is_paid: false,
                                                  })
                                                  .countDocuments();

      const totalUnpaidTrips = await trip_model.find({
                                                      driver_name: check_again._id,
                                                      trip_status: "Completed",
                                                      is_paid: false,
                                                      drop_time: {
                                                        $lte: startOfCurrentWeek,
                                                      },
                                                    })
                                                    .countDocuments();

      const totalActiveTrips = await trip_model.find({
                                                      driver_name: check_again._id,
                                                      trip_status: "Active",
                                                    })
                                                    .countDocuments();

      check_data = check_again;

      let checkPassword = await bcrypt.compare(
                                                data.password,
                                                check_data.password
                                              );

        
      if (!checkPassword) {
        return res.send({
                          code: constants.error_code,
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
                                  userId: check_data._id,
                                  companyPartnerAccess: false
                                },
                                process.env.JWTSECRET,
                                { expiresIn: "365d" }
                              );

      const updateDriver = { is_login: true };

      if (mobile) {
        updateDriver.jwtTokenMobile = jwtToken;
        updateDriver.lastUsedTokenMobile = new Date();
      } else {
        updateDriver.jwtToken = jwtToken;
        updateDriver.webDeviceToken = webDeviceToken;
        updateDriver.lastUsedToken = new Date();
      }

      if (deviceToken) {
        updateDriver.deviceToken = deviceToken;
      }
      let updateLogin = await DRIVER.findOneAndUpdate(
                                                        { _id: check_data._id },
                                                        { $set: updateDriver },
                                                        { new: true }
                                                      );

      if (updateLogin?.isCompany) {

        let updateUserDeviceToken = await USER.findOneAndUpdate(
                                                                  { _id: updateLogin.driver_company_id },
                                                                  { $set: {deviceToken: deviceToken , webDeviceToken: webDeviceToken} },
                                                                  { new: true }
                                                                );
      }

      let check_data2 = updateLogin.toObject();
      check_data2.role = "DRIVER";
      check_data2.totalTrips = completedTrips;
      check_data2.totalUnpaidTrips = totalUnpaidTrips;
      check_data2.totalActiveTrips = totalActiveTrips;

      res.send({
                code: constants.success_code,
                message: res.__('userLogin.success.loginWelcome'),
                result: check_data2,
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
                          code: constants.error_code,
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
          await check_data.save();
          await sendSms({
            to: check_data.phone,
            message: res.__('userLogin.success.otpMessage', { first_name: check_data.first_name , last_name: check_data.last_name})
          });

          setTimeout(() => { removeOTPAfter5Minutes(uniqueId); }, 120 * 1000); // 120 seconds ( 2 minutes)

          return res.send({
                            code: constants.OTP_CODE,
                            message: res.__('userLogin.success.otpSent', { phone: check_data.phone.slice(-4)}),
                            uniqueId: uniqueId,
                            OTP: OTP,
                          });

        } else {

          return res.send({
                            code: constants.error_code,
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

      let updateData = {}
      if (mobile) {
        updateData.jwtTokenMobile = jwtToken;
        updateData.lastUsedTokenMobile = new Date();
      } else {
        updateData.jwtToken = jwtToken;
        updateData.webDeviceToken = webDeviceToken;
        updateData.lastUsedToken = new Date();
      }
      if (deviceToken) {
        updateData.deviceToken = deviceToken;
      }


      // await check_data.save();
      await USER.findByIdAndUpdate( check_data._id, { $set: updateData }, { new: true });

      // Update device token imn driver profile if compmany has driver account also
      if (check_data.isDriver) {

        let updateDriverdata = {deviceToken: deviceToken}
        if (mobile) {
          updateDriverdata.jwtTokenMobile = null
        } else {
          updateDriverdata.jwtToken = null
          updateDriverdata.webDeviceToken = webDeviceToken
        }
        await DRIVER.findOneAndUpdate(
                                        {_id: check_data.driverId},
                                        updateDriverdata,
                                        { 
                                          new: true,     // Return the updated document
                                          upsert: false, // Do not create a new document if none is found
                                        }
                                      )
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
        code: constants.success_code,
        message: res.__('userLogin.success.loginWelcome'),
        result: getData[0] ? getData[0] : check_data,
        jwtToken: jwtToken,
      });
    }
  } catch (err) {
    res.send({
      code: constants.error_code,
      message: err.message,
    });
  }
};

exports.appLogin = async (req, res) => {
console.log('get it inoto-----------')
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
    const roleType = data.roleType;

    if (roleType === constants.ROLES.COMPANY) {
      
      let userData = await USER.findOne({
                                        $and: [
                                          {
                                            $or: [
                                              { email: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
                                              { phone: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
                                            ],
                                          },
                                          {
                                            is_deleted: false,
                                          },
                                        ],
                                      });

      if (userData?.is_blocked) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.companyAccessRestricted')
                        });
      }

      let checkPassword = await bcrypt.compare( data.password, userData.password );

      if (!checkPassword) {
        return res.send({
                          code: constants.error_code,
                          message: res.__('userLogin.error.incorrectCredentials'),
                        });
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
                                  userId: userData._id,
                                  companyPartnerAccess: false
                                },
                                process.env.JWTSECRET,
                                { expiresIn: "365d" }
                              );

      let updateData =  {
                          jwtTokenMobile: jwtToken,
                          lastUsedTokenMobile: new Date(),
                          deviceToken: deviceToken,
                        }

      await USER.findByIdAndUpdate( userData._id, { $set: updateData }, { new: true });

      // Update device token imn driver profile if compmany has driver account also
      if (userData.isDriver) {

        let updateDriverdata = {
                                  deviceToken: deviceToken,
                                  jwtTokenMobile: null,
                                }
        
        await DRIVER.findOneAndUpdate(
                                        {_id: userData.driverId},
                                        updateDriverdata,
                                        { 
                                          new: true,     // Return the updated document
                                          upsert: false, // Do not create a new document if none is found
                                        }
                                      )
      }

      const getData = await USER.aggregate([
                                            {
                                              $match: { _id: new mongoose.Types.ObjectId(userData._id) },
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
                        code: constants.success_code,
                        message: res.__('userLogin.success.loginWelcome'),
                        result: getData[0] ? getData[0] : userData,
                        jwtToken: jwtToken,
                      });
      

    } else if (roleType === constants.ROLES.DRIVER) {
      
      let driverDetail  = await DRIVER.findOne({
                                                $and: [
                                                  {
                                                    $or: [
                                                      { email: { $regex: data.email, $options: "i" } },
                                                      { phone: { $regex: data.email, $options: "i" } },
                                                    ],
                                                  },
                                                  {
                                                    is_deleted: false,
                                                  },
                                                ],
                                              });

      
      if (!driverDetail) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.incorrectCredentials'),
                        });
      } else if (driverDetail?.is_blocked) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('userLogin.error.accessRestricted')
                        });
      } else {

        let checkPassword = await bcrypt.compare(
                                                data.password,
                                                driverDetail.password
                                              );

        if (!checkPassword) {
          return res.send({
                            code: constants.error_code,
                            message: res.__('userLogin.error.incorrectCredentials')
                          });
        
        }
        const completedTrips = await trip_model.find({
                                                      driver_name: driverDetail._id,
                                                      trip_status: "Completed",
                                                      is_paid: false,
                                                    })
                                                    .countDocuments();

        const totalUnpaidTrips = await trip_model.find({
                                                        driver_name: driverDetail._id,
                                                        trip_status: "Completed",
                                                        is_paid: false,
                                                        drop_time: {
                                                          $lte: startOfCurrentWeek,
                                                        },
                                                      })
                                                      .countDocuments();

        const totalActiveTrips = await trip_model.find({
                                                          driver_name: driverDetail._id,
                                                          trip_status: "Active",
                                                        })
                                                        .countDocuments();

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

        let jwtToken =  jwt.sign(
                              { 
                                userId: driverDetail._id,
                                companyPartnerAccess: false
                              },
                              process.env.JWTSECRET,
                              { expiresIn: "365d" }
                            );
        
        const updateDriver = { 
          is_login: true,
          jwtTokenMobile: jwtToken,
          lastUsedTokenMobile: new Date(),
          deviceToken:deviceToken
        };

        let updateLogin = await DRIVER.findOneAndUpdate(
                                                          { _id: driverDetail._id },
                                                          { $set: updateDriver },
                                                          { new: true }
                                                        );
        if (updateLogin?.isCompany) {

          let updateUserDeviceToken = await USER.findOneAndUpdate(
                                                                    { _id: updateLogin.driver_company_id },
                                                                    { $set: {deviceToken: deviceToken} },
                                                                    { new: true }
                                                                  );
        }

        let check_data2 = updateLogin.toObject();
        check_data2.role = "DRIVER";
        check_data2.totalTrips = completedTrips;
        check_data2.totalUnpaidTrips = totalUnpaidTrips;
        check_data2.totalActiveTrips = totalActiveTrips;

        return res.send({
                          code: constants.success_code,
                          message: res.__('userLogin.success.loginWelcome'),
                          result: check_data2,
                          jwtToken: jwtToken,
                        });
                
      }
    } else {
      return res.send({
        code: constants.error_code,
        message: res.__('userLogin.error.incorrectCredentials')
      });
    }

  } catch (err) {
    return res.send({
                      code: constants.error_code,
                      message: err.message,
                    });
  }
}

exports.getIosAppVersion = async (req, res) => {
  const appId = 6476204096;
  const url = `https://itunes.apple.com/lookup?id=${appId}`;
  try {

    const response = await axios.get(url);
    const data = response.data;
    res.send({
      code: constants.success_code,
      message: data.results[0].version
    });
  } catch (error) {
    res.send({
      code: constants.error_code,
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
          code: constants.success_code,
          message: res.__('userLogin.success.loginWelcome'),
          result: getData[0] ? getData[0] : check_data,
          jwtToken: jwtToken,
        });
      } else {
        return res.send({
          code: constants.error_code,
          message: res.__('loginOtpVerify.error.invalidOtp')
        });
      }
      res.send({
        code: constants.success_code,
        message: user,
      });
    } else {
      return res.send({
        code: constants.error_code,
        message: res.__('loginOtpVerify.error.requestExpired')
      });
    }
  } catch (error) {
    console.log("🚀 ~ exports.login= ~ err:", error);
    return res.send({
        code: constants.error_code,
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
          await sendSms({
            to: check_data.phone,
            message: res.__('userLogin.success.otpMessage' , {first_name: check_data.first_name , last_name: check_data.last_name, OTP:OTP})
          });

          setTimeout(() => {
            removeOTPAfter5Minutes(uniqueId);
          }, 120 * 1000); // 120 seconds ( 2 minutes)

          return res.send({
            code: constants.OTP_CODE,
            message: res.__('userLogin.success.otpSent' , {phone: check_data.phone.slice(-4)}),
            OTP: OTP,
            uniqueId: uniqueId,
          });
        } else {
          return res.send({
            code: constants.error_code,
            message:res.__('userLogin.error.noPhoneLinked'),
          });
        }
      } else {
        return res.send({
          code: constants.error_code,
          message: res.__('loginOtpVerify.error.roleValidationFailed'),
        });
      }
    } else {
      return res.send({
        code: constants.error_code,
        message: res.__('loginOtpVerify.error.requestExpired')
      });
    }
  } catch (error) {
    console.log("🚀 ~ exports.login= ~ err:", error);
    res.send({
      code: constants.error_code,
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
    } else {

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
                          code: constants.error_code,
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
    return  res.send({
                      code: constants.error_code,
                      message: err.message,
                    });
  }
};

exports.send_otp = async (req, res) => {
  try {
    let data = req.body;
    let check_email = await USER.findOne({
      $and: [
        {
          $or: [
            { email: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
            { phone: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
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
              { email: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
              { phone: { $regex: `^${data.email}$`, $options: "i" } }, // Exact match
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
      var transporter = nodemailer.createTransport(emailConstant.credentials);
      var mailOptions = {
        from: emailConstant.from_email,
        to: check_driver.email,
        subject: "Reset your password",
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
              There was a request to change your password!
              <br>
                Your OTP is provided below:
              <br>
              <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${check_driver.email}</span> 
              <br>
                <span style="font-weight:bold;">OTP: &nbsp;</span><span style="font-weight:lighter;" class="">${data.OTP}</span>
              <br><br>  
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
        message: res.__('sendOtp.success.otpSentToContact'),
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
        var transporter = nodemailer.createTransport(emailConstant.credentials);
        var mailOptions = {
          from: emailConstant.from_email,
          to: check_email.email,
          subject: "Reset your password",
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
    There was a request to change your password!
     <br>
      Your OTP is provided below:
    <br>
    <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${check_email.email}</span> 
     <br>
      <span style="font-weight:bold;">OTP: &nbsp;</span><span style="font-weight:lighter;" class="">${data.OTP}</span>
    <br><br>  
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
          message: res.__('sendOtp.success.otpSent'),
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

exports.verify_otp = async (req, res) => {
  try {
    let data = req.body;

    let checkEmail;
    let checkEmail1 = await USER.findOne({
      email: { $regex: data.email, $options: "i" },
    });
    if (!checkEmail1) {
      let checkEmail2 = await DRIVER.findOne({email: { $regex: data.email, $options: "i" },});

      if (!checkEmail2) {
        return res.send({
                          code: constant.error_code,
                          message:  res.__('loginOtpVerify.error.invalidEmail'),
                        });
      }

      let checkEmail = checkEmail2;
      if (data.OTP != checkEmail.OTP) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('loginOtpVerify.error.invalidOtp'),
                        });
        
      }
      return res.send({
                        code: constant.success_code,
                        message: res.__('loginOtpVerify.success.otpVerified'),
                      });
    } else {
      if (data.OTP != checkEmail1.OTP) {
        res.send({
          code: constant.error_code,
          message: res.__('loginOtpVerify.error.invalidOtp'),
        });
        return;
      }
      res.send({
        code: constant.success_code,
        message: res.__('loginOtpVerify.success.otpVerified'),
      });
     
    }
  } catch (err) {
    console.log(err);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.forgot_password = async (req, res) => {
  try {
    let data = req.body;

    let criteria = { email: { $regex: data.email, $options: "i" } };
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
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};
