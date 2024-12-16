require("dotenv").config();
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
        message: "Email is already exist!",
      });
      return;
    }
    let checkPhone = await USER.findOne({ phone: data.phone });
    if (checkPhone) {
      res.send({
        code: constants.error_code,
        message: "Phone number is already exist",
      });
      return;
    }
    let hash = await bcrypt.hashSync(data.password, 10);
    data.password = hash;
    let save_data = await USER(data).save();
    if (!save_data) {
      res.send({
        code: constants.error_code,
        message: "Unable to save the data",
      });
    } else {
      let jwtToken = jwt.sign(
        { userId: save_data._id },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      save_data.jwtToken = jwtToken;
      res.send({
        code: constants.success_code,
        message: "Successfully created",
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
    const mobile = data?.platform == "mobile";

    let check_data;
    let userData = await USER.findOne({
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
    }).populate("created_by driverId");

    // If user is blocked by admin or super admin

    if (
      userData &&
      userData.role != "SUPER_ADMIN" &&
      (userData?.is_blocked || userData?.created_by?.is_blocked)
    ) {
      return res.send({
        code: constant.error_code,
        message:
          "You are blocked by administration. Please contact administration",
      });
    }

    // If user is not a company , admin , super admin
    if (!userData) {
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
        res.send({
          code: constant.error_code,
          message: "Invalid Credentials",
        });
        return;
      }

      if (check_again?.is_blocked)
      {
        return res.send({
          code: constant.error_code,
          message:
            "You are blocked by administration. Please contact administration",
        });
      }
      const completedTrips = await trip_model
        .find({
          driver_name: check_again._id,
          trip_status: "Completed",
          is_paid: false,
        })
        .countDocuments();
      const totalUnpaidTrips = await trip_model
        .find({
          driver_name: check_again._id,
          trip_status: "Completed",
          is_paid: false,
          drop_time: {
            $lte: startOfCurrentWeek,
          },
        })
        .countDocuments();
      const totalActiveTrips = await trip_model
        .find({
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
        res.send({
          code: constants.error_code,
          message: "Invalid Credentials",
        });
        return;
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
      let jwtToken = jwt.sign(
        { userId: check_data._id },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      const updateDriver = { is_login: true };
      if (mobile) {
        updateDriver.jwtTokenMobile = jwtToken;
        updateDriver.lastUsedTokenMobile = new Date();
      } else {
        updateDriver.jwtToken = jwtToken;
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
      let check_data2 = updateLogin.toObject();
      check_data2.role = "DRIVER";
      check_data2.totalTrips = completedTrips;
      check_data2.totalUnpaidTrips = totalUnpaidTrips;
      check_data2.totalActiveTrips = totalActiveTrips;
      res.send({
        code: constants.success_code,
        message: "Login Successful",
        result: check_data2,
        jwtToken: jwtToken,
      });
    } else {
      check_data = userData;

      // If user blocked by Super admin or admin
      if (check_data?.is_blocked) {
        return res.send({
          code: constant.error_code,
          message:
            "You are blocked by administration. Please contact adminstation",
        });
      }

      // compare the password
      let checkPassword = await bcrypt.compare(
        data.password,
        check_data.password
      );

      if (!checkPassword) {
        res.send({
          code: constants.error_code,
          message: "Invalid Credentials",
        });
        return;
      }

      //  OTP will send during the login for ADMIN AND SUPER_ADMIN
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
            message: `Hello ${check_data.first_name} ${check_data.first_name} , Your OTP for login is ${OTP}. Please enter this code to complete your login. This OTP will expire in 5 minutes.`,
          });

          setTimeout(() => {
            removeOTPAfter5Minutes(uniqueId);
          }, 120 * 1000); // 120 seconds ( 2 minutes)

          return res.send({
            code: constants.OTP_CODE,
            message: `We have sent the OTP to this phone number that ends with ${check_data.phone.slice(
              -4
            )}`,
            uniqueId: uniqueId,
            OTP: OTP,
          });
        } else {
          return res.send({
            code: constants.error_code,
            message:
              "We can't send OTP because you didn't have phone number in our system",
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
        { userId: check_data._id },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );

      if (mobile) {
        check_data.jwtTokenMobile = jwtToken;
        check_data.lastUsedTokenMobile = new Date();
      } else {
        check_data.jwtToken = jwtToken;
        check_data.lastUsedToken = new Date();
      }
      if (deviceToken) {
        check_data.deviceToken = deviceToken;
      }
      await check_data.save();
      
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
        message: "Login Successful",
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
          { userId: check_data._id },
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
          message: "Login Successful",
          result: getData[0] ? getData[0] : check_data,
          jwtToken: jwtToken,
        });
      } else {
        return res.send({
          code: constants.error_code,
          message: "Invalid OTP",
        });
      }
      res.send({
        code: constants.success_code,
        message: user,
      });
    } else {
      return res.send({
        code: constants.error_code,
        message:
          "This request has been expired. Please validate the credential again",
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
            message: `Hello ${check_data.first_name} ${check_data.first_name} , Your OTP for login is ${OTP}. Please enter this code to complete your login. This OTP will expire in 5 minutes.`,
          });

          setTimeout(() => {
            removeOTPAfter5Minutes(uniqueId);
          }, 120 * 1000); // 120 seconds ( 2 minutes)

          return res.send({
            code: constants.OTP_CODE,
            message: `We have sent the OTP to this phone number that ends with ${check_data.phone.slice(
              -4
            )}`,
            OTP: OTP,
            uniqueId: uniqueId,
          });
        } else {
          return res.send({
            code: constants.error_code,
            message:
              "We can't send OTP because you didn't have phone number in our system",
          });
        }
      } else {
        return res.send({
          code: constants.error_code,
          message: "Invalid role",
        });
      }
    } else {
      return res.send({
        code: constants.error_code,
        message:
          "This request has been expired. Please validate the credential again",
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

    console.log('req------------' , req.user)
    let result1;
    const userByID = await USER.findOne({ _id: req.userId }).populate(
      "driverId"
    );

    let lookupData = {
                      from: "agencies",
                      localField: "_id",
                      foreignField: "user_id",
                      as: "company_detail",
                    }

    if (req.user.role == constant.ROLES.HOTEL) {
      
      lookupData.from = 'users';
      lookupData.localField = 'created_by';
      lookupData.foreignField = '_id';
    } else {

    }
    let getData = await USER.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(req.userId) },
      },
      {
        $lookup: lookupData,
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver",
        },
      },
      { $unwind: "$company_detail" },
      // {
      //   path: "driver",
      //   preserveNullAndEmptyArrays: true
      // }
    ]);

    if (!userByID) {
      let get_data = await DRIVER.findOne({ _id: req.userId });
      if (!get_data) {
        res.send({
          code: constants.error_code,
          message: "Unable to fetch the detail",
        });
        return;
      }
      const totalUnpaidTrips = await trip_model
        .find({
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
      res.send({
        code: constant.success_code,
        message: "Success",
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
      res.send({
        code: constant.success_code,
        message: "Success",
        result: dataResult ? dataResult : userByID,
      });
    }
  } catch (err) {
    res.send({
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
            { email: { $regex: data.email, $options: "i" } },
            { phone: { $regex: data.email, $options: "i" } },
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
              { email: { $regex: data.email, $options: "i" } },
              { phone: { $regex: data.email, $options: "i" } },
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

      if (!check_driver) {
        res.send({
          code: constant.error_code,
          message: "Invalid email IDs",
        });
        return;
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
<img alt="robot picture" class="welcom-logo" src="C:\Users\Richa\Desktop\taxi-app-images\login-logo.png" width="40%">
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
        message: "OTP sent successfully",
      });
    } else {
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
          message: "Unable to send the otp please try again",
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
    <img alt="robot picture" class="welcom-logo" src="C:\Users\Richa\Desktop\taxi-app-images\login-logo.png" width="40%">
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
          message: "OTP sent successfully",
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
      let checkEmail2 = await DRIVER.findOne({
        email: { $regex: data.email, $options: "i" },
      });
      if (!checkEmail2) {
        res.send({
          code: constant.error_code,
          message: "Invalid Email",
        });
        return;
      }
      let checkEmail = checkEmail2;
      if (data.OTP != checkEmail.OTP) {
        res.send({
          code: constant.error_code,
          message: "Invalid OTP",
        });
        return;
      }
      res.send({
        code: constant.success_code,
        message: "OTP verified successfully",
      });
    } else {
      if (data.OTP != checkEmail1.OTP) {
        res.send({
          code: constant.error_code,
          message: "Invalid OTP",
        });
        return;
      }
      res.send({
        code: constant.success_code,
        message: "OTP verified successfully",
      });
      // console.log('current', moment().format(), 'expiry-----', checkEmail1.otp_expiry)
      // const currentDate = new Date(moment().format());
      // // Expiry date
      // const expiryDate = new Date(checkEmail.otp_expiry);
      // if (expiryDate > currentDate) {
      //     res.send({
      //         code: constant.error_code,
      //         message: "Your otp is expired"
      //     })
      //     return;
      // }
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
        res.send({
          code: constant.error_code,
          message: "Please enter valid email",
        });
        return;
      }
      let option = { new: true };
      let hash = bcrypt.hashSync(data.password, 10);
      let newValue = {
        $set: {
          password: hash,
          OTP: "",
        },
      };

      let updatePassword = await DRIVER.findOneAndUpdate(
        criteria,
        newValue,
        option
      );

      if (!updatePassword) {
        res.send({
          code: constant.error_code,
          message: "Unable to udpate the password",
        });
      } else {
        res.send({
          code: constant.success_code,
          message: "Updated successfully",
        });
      }
    } else {
      let option = { new: true };
      let hash = bcrypt.hashSync(data.password, 10);
      let newValue = {
        $set: {
          password: hash,
          OTP: "",
        },
      };

      let updatePassword = await USER.findOneAndUpdate(
        criteria,
        newValue,
        option
      );
      if (!updatePassword) {
        res.send({
          code: constant.error_code,
          message: "Unable to udpate the password",
        });
      } else {
        res.send({
          code: constant.success_code,
          message: "Updated successfully",
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
    let check_email = await USER.findOne({ _id: req.userId });
    if (!check_email) {
      res.send({
        code: constant.error_code,
        message: "Invalid ID",
      });
    } else {
      let comparePassword = await bcrypt.compare(
        data.oldPassword,
        check_email.password
      );
      if (!comparePassword) {
        res.send({
          code: constant.error_code,
          message: "Old password is not correct",
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
        let option = { new: true };
        let updateUser = await USER.findOneAndUpdate(
          criteria,
          newValue,
          option
        );
        if (!updateUser) {
          res.send({
            code: constant.error_code,
            message: "Unable to update the password",
          });
        } else {
          res.send({
            code: constant.success_code,
            message: "Updated successfully",
          });
        }
      }
    }
  } catch (err) {
    res.send({
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
        message: "Unable to save the data",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Saved Successylly",
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
      message: "Success",
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
