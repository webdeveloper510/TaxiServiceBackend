const USER = require("../../models/user/user_model");
const AGENCY = require("../../models/user/agency_model");
const DRIVER = require("../../models/user/driver_model");
const BANK_ACCOUNT_DETAILS_MODEL = require("../../models/user/bank_account_details_model");
const TRIP = require("../../models/user/trip_model");
const { getCompanyNextSequenceValue } = require("../../models/user/company_counter_model");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const constant = require("../../config/constant");
const emailConstant = require("../../config/emailConstant");
const randToken = require("rand-token").generator();
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");
require("dotenv").config();
const multer = require("multer");
const path = require("path");
const { sendNotification ,  getCityAndCountry} = require("../../Service/helperFuntion");
const { isDriverHasCompanyAccess , dateFilter , createCustomAccount , sendAccountDeactivationEmail , sendAccountReactivationEmail} = require("../../Service/helperFuntion");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../../config/cloudinary");
const driver_model = require("../../models/user/driver_model");
const imageStorage = require("../../config/awss3");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// const imageStorage = new CloudinaryStorage({
//     cloudinary: cloudinary,
//     params: {
//         folder: "TaxiBooking",
//         public_id: (req, files) =>
//             `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
//         maxFileSize: 100000000000,
//     },
// });

var logoUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
}).single("logo");

exports.add_sub_admin = async (req, res) => {
  try {
    let data = req.body;
    data.email = data.email.toLowerCase();

    

    let checkEmail = await USER.findOne({
                                          email: { $regex: new RegExp(`^${data.email}$`, 'i') }, // Case-insensitive match
                                          is_deleted: false,
                                        });

    if (checkEmail) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.emailAlreadyInUse'),
                      });
    }

    // Cheked Email in driver table if comapany already rigestered as a driver then match email except the driver that is already created. 
    let checkDriverEmail = await DRIVER.findOne({
                                                  email: { $regex: new RegExp(`^${data.email}$`, 'i') }, // Case-insensitive match
                                                  is_deleted: false,
                                                  ...(data.role === constant.ROLES.COMPANY && data?.isDriver == 'true'
                                                    ? { _id: { $ne: new mongoose.Types.ObjectId(data?.driverId) } }
                                                    : {}), 
                                                });

   
    if (checkDriverEmail) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.emailAlreadyInUse'),
                      });
    }
    let checkPhone = await USER.findOne({
                                          phone: data.phone,
                                          is_deleted: false,
                                        });
                                        
    if (checkPhone) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.phoneAlreadyInUse'),
                      });
    }

    let checkDriverPhone = await DRIVER.findOne({
                                                  phone: data.phone, 
                                                  is_deleted: false,
                                                  ...(data.role === constant.ROLES.COMPANY && data?.isDriver == 'true'
                                                    ? { _id: { $ne: new mongoose.Types.ObjectId(data?.driverId) } }
                                                    : {}), 
                                                });
                                        
    if (checkDriverPhone) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.phoneAlreadyInUse'),
                      });
    }

    let isDriverAlreadyCompany ;
    if (data.role === constant.ROLES.COMPANY && data?.isDriver == 'true') {

      isDriverAlreadyCompany = await DRIVER.findOne({ _id: new mongoose.Types.ObjectId(data?.driverId) });

      if ( isDriverAlreadyCompany && isDriverAlreadyCompany.driver_company_id != null) {

        return res.send({
                          code: constant.error_code,
                          message: res.__('addDriver.error.driverHasOwnCompany'),
                        });
      }
    }
    
    let passwordEmail = randToken.generate( 8, "1234567890abcdefghijklmnopqrstuvxyz" );
    passwordEmail = data?.isDriver == 'true' ? isDriverAlreadyCompany?.stored_password : passwordEmail;
    // let passwordEmail = "Test@123"

    let hashedPassword = await bcrypt.hashSync(passwordEmail, 10);
    data.password = hashedPassword;
    data.stored_password= passwordEmail;

    if (data.role == constant.ROLES.COMPANY) {
      // data.company_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
      data.company_id = await getCompanyNextSequenceValue();
      data.company_id = "C" + "-" + data.company_id;
    } else {
      data.company_id = data.company_id;
    }


    let check_hotel = await AGENCY.findOne({ company_id: data.company_id });
    
    if (check_hotel) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.hotelIdAlreadyExists'),
                      });
    }
    // data.role = 'COMPANY'

    // Create or get stripe customer id
    let customer = await stripe.customers.list({ email: data.email });
    const userFormattedAddress = `${data?.house_number} ${data?.land} , ${data?.post_code}`;
    const getAddressData = await getCityAndCountry(userFormattedAddress);
    const city = getAddressData?.city ? getAddressData?.city : '';
    const country = getAddressData?.city ? getAddressData?.country : '';
    const stripeUserData = { 
                              name: data?.company_name,
                              email: data.email,
                              address: {
                                        line1: userFormattedAddress,
                                        postal_code: data?.post_code,
                                        city: city,
                                        country: country
                                      }, 
                                      metadata: {
                                                  person_name: `${data?.first_name} ${data?.last_name}`
                                                }
                            }
    if (customer.data.length) {
      
      customer =  customer.data[0]
      await stripe.customers.update(customer.id, stripeUserData); //update user info
      
    } else {
      customer = await stripe.customers.create(stripeUserData ) // create user with new info

    }
    // customer = customer.data.length ? customer.data[0] : await stripe.customers.create({ email: data.email });
    data.stripeCustomerId = customer.id; //  stripe customer id assiged

    const connectedAccountId = await createCustomAccount(data.email); // created connected account 
    data.connectedAccountId = connectedAccountId;

    let bankAccountDetails = {};

    // Attach bank to connected account
    if (data.iban_details) {

      // data.bankAccountId = data.iban_details.bank_account.id;
      // const externalAccount = await attachBankAccount(connectedAccountId , data.iban_details.id);
      // console.log('externalAccount---' , JSON.stringify(externalAccount));
      
      // data.externalAccountId = externalAccount.id;
      // data.bankAccountId = data.iban_details.bank_account.id;

      // bankAccountDetails.placeHolderName = data.iban_details.bank_account.account_holder_name;
      // bankAccountDetails.ibnBankDetails = data.iban_details.bank_account;
      // bankAccountDetails.externalAccountId = externalAccount.id;
      // bankAccountDetails.role = data.role;
      // bankAccountDetails.userId = null;
      // bankAccountDetails.ownerId = null;
    }

    // delete data.iban_details;
    
    data.created_by = req.userId;
    let save_data = await USER(data).save();

    if (!save_data) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.saveFailed'),
                      });
    } else {
      let jwtToken = jwt.sign(
                                { userId: save_data._id, email: save_data.email, role: save_data.role },
                                process.env.JWTSECRET,
                                { expiresIn: "365d" }
                              );
      data.user_id = save_data._id;

      // If user gave th IBAN number for attaching the bank account
      if (bankAccountDetails?.externalAccountId) {

        // bankAccountDetails.userId = save_data._id;
        // bankAccountDetails.ownerId = save_data._id;
        // const newbankAccountDetails = new BANK_ACCOUNT_DETAILS_MODEL(bankAccountDetails);
        // await newbankAccountDetails.save();
      }

      // mail function
      var transporter = nodemailer.createTransport(emailConstant.credentials);
      var mailOptions = {
        from: emailConstant.from_email,
        to: data.email,
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
                    <tr class=""><td class="headline">Welcome to iDispatch!</td></tr>
                    <tr>
                    <td>
                    <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                    <td class="" style="color:#444; font-weight: 400;"><br>
                    <br><br>
                      You have successfully been registered to use iDispatch as a <em>${
                        data.role == "COMPANY" ? "company" : "customer"
                      }</em><br>
                     <br>
                      Your login credentials are provided below:
                    <br>
                    <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${
                      data.email
                    }</span> 
                     <br>
                      <span style="font-weight:bold;">Password: &nbsp;</span><span style="font-weight:lighter;" class="">${passwordEmail}</span>
                    <br><br>  
                    <br></td>
                    </tr>
                    </tbody></table></center>
                    </td>
                    </tr>
                    <tr>
                    <td class="">
                    <div class="">
                    <a style="background-color:#0682ca;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="${process.env.BASEURL}/login">Visit Account and Start Managing</a>
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
      // Welcome to iDispatch, your email is ${data.email} and password is ${passwordEmail}

      // Saving the extra data in Agency table
      let save_meta_data = await AGENCY(data).save();
      save_data.meta = save_meta_data;

      //  Update the compnay information  to the selected driver. Now driver and company attached together
      if (data.role === constant.ROLES.COMPANY && data?.isDriver == 'true') {

        await DRIVER.updateOne( 
                                { _id: new mongoose.Types.ObjectId(data?.driverId) },
                                { $set: { driver_company_id: save_data._id  , company_agency_id: save_meta_data._id , isCompany: true} }
                              );
      }

      return res.send({
                        code: constant.success_code,
                        message: res.__('addDriver.success.subAdminAdded'),
                        result: save_data,
                        jwtToken: jwtToken,
                      });
    }
  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.add_admin = async (req, res) => {
  // Add admin

  try {
    let data = req.body;
    data.email = data.email.toLowerCase();
    let checkEmail = await USER.findOne({ email: data.email });

    if (checkEmail && checkEmail?.is_deleted) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.emailLinkedToInactiveAccount'),
                      });
    }
    if (checkEmail) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.emailAlreadyInUse'),
                      });

    }
    let checkDEmail = await DRIVER.findOne({
                                              email: data.email,
                                              is_deleted: false,
                                            });
    if (checkDEmail) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.emailAlreadyInUse'),
                      });
      
    }
    let checkPhone = await USER.findOne({
                                          phone: data.phone,
                                          is_deleted: false,
                                        });

    if (checkPhone) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addDriver.error.phoneAlreadyInUse'),
                      });
      
    }
    let passwordEmail = randToken.generate( 8, "1234567890abcdefghijklmnopqrstuvxyz");
    
    // let passwordEmail = "Test@123"
    let hashedPassword = await bcrypt.hashSync(passwordEmail, 10);
    data.password = hashedPassword;
    data.role = constant.ROLES.ADMIN;
    data.stored_password= passwordEmail;

    data.created_by = req.userId;
    let save_data = await USER(data).save();
    if (!save_data) {
      res.send({
        code: constant.error_code,
        message: res.__('addDriver.error.saveFailed'),
      });
    } else {
      let jwtToken = jwt.sign(
        { userId: save_data._id, email: save_data.email, role: save_data.role },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      data.user_id = save_data._id;

      // mail function
      var transporter = nodemailer.createTransport(emailConstant.credentials);
      var mailOptions = {
        from: emailConstant.from_email,
        to: data.email,
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
                    <tr class=""><td class="headline">Welcome to iDispatch!</td></tr>
                    <tr>
                    <td>
                    <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                    <td class="" style="color:#444; font-weight: 400;"><br>
                    <br><br>
                      You have successfully been registered to use iDispatch as a <em>Super Admin </em><br>
                     <br>
                      Your login credentials are provided below:
                    <br>
                    <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${data.email}</span> 
                     <br>
                      <span style="font-weight:bold;">Password: &nbsp;</span><span style="font-weight:lighter;" class="">${passwordEmail}</span>
                    <br><br>  
                    <br></td>
                    </tr>
                    </tbody></table></center>
                    </td>
                    </tr>
                    <tr>
                    <td class="">
                    <div class="">
                    <a style="background-color:#0682ca;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="${process.env.BASEURL}/login">Visit Account and Start Managing</a>
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
      // Welcome to iDispatch, your email is ${data.email} and password is ${passwordEmail}

      res.send({
        code: constant.success_code,
        message: res.__('addDriver.success.superAdminAdded'),
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.admin_list = async (req, res) => {
  try {
    let admin_list = await USER.find(
      { role: constant.ROLES.ADMIN, is_deleted: false },
      {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        phone: 1,
        role: 1,
        is_deleted: 1,
        status: 1,
        is_blocked: 1
      }
    ).sort({ first_name: 1 }).collation({ locale: 'en', strength: 1 });
    res.send({
      code: constant.success_code,
      data: admin_list,
    });
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_admin_details = async (req, res) => {
  try {
    const admin_id = req.params.id;

    let admin_detail = await USER.findOne({
                                            _id: admin_id,
                                            is_deleted: false,
                                            status: true,
                                          });

    if (admin_detail) {
      return res.send({
                        code: constant.success_code,
                        data: admin_detail,
                      });
    } else {
      return res.send({
                        code: constant.error_code,
                        message: res.__('getAdminDetail.error.noAdminsFound'),
                        id: new mongoose.Types.ObjectId(admin_id),
                      });
    }
  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.update_admin_details = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let option = { new: true };
    let check_admin = await USER.findOne(criteria);

    if (!check_admin) {
      return res.send({
        code: constant.error_code,
        message: res.__('getAdminDetail.error.noAdminsFound'),
      });
    }

    if (check_admin.email != data.email) {
      let check_email = await USER.findOne({ email: data.email });
      if (check_email) {
        return res.send({
          code: constant.error_code,
          message: res.__('addDriver.error.emailAlreadyInUse'),
        });
      }
    }

    if (check_admin.phone != data.phone) {
      let check_phone = await USER.findOne({ phone: data.phone });

      if (check_phone) {
        return res.send({
          code: constant.error_code,
          message: res.__('addDriver.error.phoneAlreadyInUse'),
        });
      }
    }

    let update_data = await USER.findOneAndUpdate(criteria, data, option);

    if (!update_data) {
      res.send({
        code: constant.error_code,
        message: res.__('addDriver.error.saveFailed'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('getAdminDetail.success.adminAccountUpdated'),
        result: update_data,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.delete_admin = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let option = { new: true };
    let newValue = {
      $set: {
        is_deleted: true,
        deleted_by_id: req.userId,
      },
    };
    let delete_admin = await USER.findOneAndUpdate(criteria, newValue, option);
    if (!delete_admin) {
      res.send({
        code: constant.error_code,
        message: res.__('getAdminDetail.error.deleteError'),
      });
    } else {
      return res.send({
        code: constant.success_code,
        message: res.__('getAdminDetail.success.adminAccountDeleted'),
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_sub_admins = async (req, res) => {
  try {  
    let data = req.body;
    let query = req.query.role ? req.query.role : constant.ROLES.COMPANY;

    let get_data = await USER.aggregate([
      {
        $match: {
          role: query,
          is_deleted: false,
          status: false,
          created_by: new mongoose.Types.ObjectId(req.userId),
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "meta",
        },
      },
      {
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          // company_id:1,
          // company_name:1,
          phone: 1,
          createdAt: -1,
          profile_image: 1,
          role: 1,
          status: 1,
          totalBalance: 1,
          land: { $arrayElemAt: ["$meta.land", 0] },
          post_code: { $arrayElemAt: ["$meta.post_code", 0] },
          house_number: { $arrayElemAt: ["$meta.house_number", 0] },
          description: { $arrayElemAt: ["$meta.description", 0] },
          affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
          p_number: { $arrayElemAt: ["$meta.p_number", 0] },
          number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
          chamber_of_commerce_number: {
            $arrayElemAt: ["$meta.chamber_of_commerce_number", 0],
          },
          vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
          website: { $arrayElemAt: ["$meta.website", 0] },
          tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
          saluation: { $arrayElemAt: ["$meta.saluation", 0] },
          company_name: { $arrayElemAt: ["$meta.company_name", 0] },
          company_id: { $arrayElemAt: ["$meta.company_id", 0] },
          commision: { $arrayElemAt: ["$meta.commision", 0] },
          location: { $arrayElemAt: ["$meta.location", 0] },
        },
      },
    ]).sort({ createdAt: -1 });

    if (!get_data) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noMatchingRecords'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message:  res.__('addSubAdmin.success.infoRetrievedSuccess'),
        result: get_data,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_sub_admin_detail = async (req, res) => {
  try {
    let data = req.params;
    let check_detail = await USER.aggregate([
                                              {
                                                $match: {
                                                  _id: new mongoose.Types.ObjectId(data.userId),
                                                },
                                              },
                                              {
                                                $lookup: {
                                                  from: "agencies",
                                                  localField: "_id",
                                                  foreignField: "user_id",
                                                  as: "meta",
                                                },
                                              },
                                              {
                                                $project: {
                                                  _id: 1,
                                                  first_name: 1,
                                                  last_name: 1,
                                                  email: 1,
                                                  // company_id:1,
                                                  created_by: 1,
                                                  phone: 1,
                                                  countryCode:1,
                                                  profile_image: 1,
                                                  role: 1,
                                                  status: 1,
                                                  logo: 1,
                                                  background_color: 1,
                                                  color:1,
                                                  stored_password:1,
                                                  totalBalance: 1,
                                                  settings:1,
                                                  land: { $arrayElemAt: ["$meta.land", 0] },
                                                  post_code: { $arrayElemAt: ["$meta.post_code", 0] },
                                                  house_number: { $arrayElemAt: ["$meta.house_number", 0] },
                                                  description: { $arrayElemAt: ["$meta.description", 0] },
                                                  affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
                                                  p_number: { $arrayElemAt: ["$meta.p_number", 0] },
                                                  number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
                                                  chamber_of_commerce_number: {
                                                    $arrayElemAt: ["$meta.chamber_of_commerce_number", 0],
                                                  },
                                                  vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
                                                  website: { $arrayElemAt: ["$meta.website", 0] },
                                                  tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
                                                  saluation: { $arrayElemAt: ["$meta.saluation", 0] },
                                                  company_name: { $arrayElemAt: ["$meta.company_name", 0] },
                                                  company_id: { $arrayElemAt: ["$meta.company_id", 0] },
                                                  location: { $arrayElemAt: ["$meta.location", 0] },
                                                  hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },
                                                  commision: { $arrayElemAt: ["$meta.commision", 0] },
                                                },
                                              },
                                            ]);
    let get_color = await USER.findOne({ _id: check_detail[0].created_by });
    if (check_detail.length == 0) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addSubAdmin.error.noUserFound'),
                      });
    } else {
      let get_name = await AGENCY.findOne({ user_id: check_detail[0]._id });
      check_detail[0].hotel_name = get_name.company_name ? get_name.company_name : "N/A";
      check_detail[0].meta = get_color?.toObject();
      const result = check_detail[0];

      return res.send({
                        code: constant.success_code,
                        message: res.__('addSubAdmin.success.infoRetrievedSuccess'),
                        result,
                      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.edit_sub_admin = async (req, res) => {
  try {
    logoUpload(req, res, async (err) => {
      let data = req.body;
      let criteria = { _id: req.params.id };
      let option = { new: true };
      let checkSubAdmin = await USER.findOne(criteria);
      if (!checkSubAdmin) {

        return res.send({
                          code: constant.error_code,
                          message: res.__('addSubAdmin.error.noUserFound'),
                        });
      }

      data.logo = req?.file?.location ? req.file.location : checkSubAdmin.logo;
      // let update_data = await USER.findOneAndUpdate(criteria, data, option)
      // let criteria2 = { user_id: update_data._id }
      if (checkSubAdmin.email != data.email) {
        let check_email = await USER.findOne({email: data.email,});
        let checkEmailInDrivers = await DRIVER.findOne({
                                                        email: data.email,
                                                        ...(checkSubAdmin?.isDriver == true ? { _id: { $ne: new mongoose.Types.ObjectId(checkSubAdmin?.driverId) } } : {}),
                                                      });
        if (check_email || checkEmailInDrivers) {
          return res.send({
                            code: constant.error_code,
                            message: res.__('addDriver.error.emailAlreadyInUse'),
                          });
        }


      }

      if (checkSubAdmin.phone != data.phone) {
        let check_phone = await USER.findOne({ phone: data.phone, });
        let checkPhoneInDrivers = await DRIVER.findOne({
                                                        phone: data.phone,
                                                        ...(checkSubAdmin?.isDriver == true ? { _id: { $ne: new mongoose.Types.ObjectId(checkSubAdmin?.driverId) } } : {}),
                                                      });
        if (check_phone || checkPhoneInDrivers) {
          return res.send({
                            code: constant.error_code,
                            message: res.__('addDriver.error.phoneAlreadyInUse'),
                          });
        }
      }

      if (data?.password && data.password != '') {

        data.stored_password = data.password;
        data.password = await bcrypt.hashSync(data.password, 10);
        // updates.jwtToken = '';
        // updates.jwtTokenMobile = '';
      } else {
        delete data.password;
      }
      
      if (data?.settings) { // when company booking settings will be saved
       
        data.settings = JSON.parse(data?.settings);
        data.settings.payment_options.cash.text = constant.PAY_OPTION.CASH
        data.settings.payment_options.debit_card.text = constant.PAY_OPTION.DEBIT_CARD
        data.settings.payment_options.credit_card.text = constant.PAY_OPTION.CREDIT_CARD
        data.settings.payment_options.on_account.text = constant.PAY_OPTION.ON_ACCOUNT
      }

      let update_data = await USER.findOneAndUpdate(criteria, data, option);

      
      let criteria2 = { user_id: update_data._id };
      let update_data_meta = await AGENCY.findOneAndUpdate( criteria2, data, option);

      // Update his driver info as well like email , phone and password 
      if (checkSubAdmin?.isDriver == true) {

        const updateDriver_data = {
          email: data.email,
          phone: data.phone,
          ...(data?.password && data.password != '' ? { stored_password: data.stored_password , password : data.password } : {}),
        }

        await DRIVER.findOneAndUpdate({ _id: new mongoose.Types.ObjectId(checkSubAdmin?.driverId) } , updateDriver_data , option)
      }
      
      let successMessage = "";
      console.log('chekcing-------' ,req.body ,Object.keys(req.body).length , req.body.hasOwnProperty("is_special_plan_active"))
      if (Object.keys(data).length == 2 && data.hasOwnProperty("is_special_plan_active")) {

        successMessage = update_data?.is_special_plan_active ? res.__('addSubAdmin.success.companySpecialPlanActivated') : res.__('addSubAdmin.success.companySpecialPlanDeactivated');
      } else {
        successMessage = res.__('addSubAdmin.success.subAdminUpdated');
      }

      if (!update_data) {
        res.send({
          code: constant.error_code,
          message: res.__('addSubAdmin.error.unableToupdate'),
        });
      } else {
        res.send({
          code: constant.success_code,
          message: successMessage,
          result: update_data,
        });
      }
    });
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.editHotel = async (req, res) => {

  try {

    let data = req.body;
    let hotelId = req.params.id
    let criteria = { _id: hotelId };
    let option = { new: true };
    let checkHotel = await USER.findOne(criteria);

    if (!checkHotel) {
      returnres.send({
                        code: constant.error_code,
                        message: res.__('addSubAdmin.error.noUserFound'),
                    });
    }

    let checkPhone = await USER.findOne({  phone: data.phone, _id: { $ne: hotelId }, });
    if (checkPhone) {

      return res.send({
        code: constant.error_code,
        message: res.__('addDriver.error.phoneAlreadyInUse'),
      });
    }

    let  updateData = {
      _id: hotelId,
      first_name: data.first_name,
      last_name: data.last_name,
      phone:data.phone
    }

    if (data?.password && data?.password != '') {

      updateData.stored_password = data.password;
      updateData.password = await bcrypt.hashSync(data.password, 10);
    }

    const update_data = await USER.findOneAndUpdate(criteria, updateData, option);

    if (update_data) {
      return res.send({
                        code: constant.success_code,
                        message: res.__('addSubAdmin.success.subAdminUpdated'),
                        result:update_data
                      });
    } else {

      return res.send({
                        code: constant.error_code,
                        message: res.__('addSubAdmin.error.unableToupdate'),
                      });
    } 

    

  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}

exports.hotelListAdmin = async (req, res) => {

    try {
      const data = req.body;
      const search = data.search || "";
      const page = parseInt(data.page) || 1; // Current page number, default to 1
      const limit = parseInt(data.limit) || 10; // Number of items per page, default to 10
      const skip = (page - 1) * limit;
      const query = { is_deleted: false, role: constant.ROLES.HOTEL};
  
      

      let searchUser = await USER.aggregate([
    
        {
          $lookup: {
            from: "agencies",
            localField: "_id",
            foreignField: "user_id",
            as: "meta",
          },
        },
        {
          $lookup: {
            from: "agencies",
            localField: "created_by",
            foreignField: "user_id",
            as: "company",
          },
        },
        {
          $match: {
            $and: [
              { role: 'HOTEL' },
              { is_deleted: false },
              {
                $or: [
                  { "meta.company_id": { $regex: search, $options: "i" } },
                  {
                    "meta.company_name": { $regex: search, $options: "i" },
                  },
                  {
                    "company.company_name": { $regex: search, $options: "i" },
                  },
                  { first_name: { $regex: search, $options: "i" } },
                  { last_name: { $regex: search, $options: "i" } },
                  { email: { $regex: search, $options: "i" } },
                  { phone: { $regex: search, $options: "i" } },
                ],
              },
            ],
          },
        },
        {
          // Add a lowercase field for case-insensitive sorting
          $addFields: {
            company_name_lower: { $toLower: { $arrayElemAt: ["$meta.company_name", 0] } }
          }
        },
  
        {
          $facet: {
            data: [
              { $sort: { company_name_lower: 1 } }, // Sort by creation date
              { $skip: skip }, // Skip to the correct page
              { $limit: limit },
              {
                $project: {
                  _id: 1,
                  first_name: 1,
                  last_name: 1,
                  email: 1,
                  // company_id:1,
                  // company_name:1,
                  phone: 1,
                  createdAt: -1,
                  profile_image: 1,
                  role: 1,
                  totalBalance: 1,
                  is_blocked:1,
                  status: 1,
                  land: { $arrayElemAt: ["$meta.land", 0] },
                  post_code: { $arrayElemAt: ["$meta.post_code", 0] },
                  house_number: { $arrayElemAt: ["$meta.house_number", 0] },
                  description: { $arrayElemAt: ["$meta.description", 0] },
                  affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
                  p_number: { $arrayElemAt: ["$meta.p_number", 0] },
                  number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
                  chamber_of_commerce_number: {
                    $arrayElemAt: ["$meta.chamber_of_commerce_number", 0],
                  },
                  vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
                  website: { $arrayElemAt: ["$meta.website", 0] },
                  tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
                  saluation: { $arrayElemAt: ["$meta.saluation", 0] },
                  company_name: { $arrayElemAt: ["$meta.company_name", 0] },
                  company_id: { $arrayElemAt: ["$meta.company_id", 0] },
                  commision: { $arrayElemAt: ["$meta.commision", 0] },
                  hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },
                  location: { $arrayElemAt: ["$meta.location", 0] },
                  hotel_company_name: { $arrayElemAt: ["$company.company_name", 0] },
                },
              },
            ],
            totalCount: [
              {
                $count: "count",
              },
            ],
          }
        }
      ]);

      const results = searchUser[0]?.data || [];
      const totalCount = searchUser[0]?.totalCount[0]?.count || 0;
      const totalPages = Math.ceil(totalCount / limit);
  
      if (searchUser) {
        res.send({
          code: constant.success_code,
          message: res.__('addSubAdmin.success.infoRetrievedSuccess'),
          result: results,
          totalCount: totalCount,
          totalPages: totalPages
        });
      } else {
        res.send({
          code: constant.error_code,
          message: res.__('addSubAdmin.error.noMatchingRecords'),
        });
      }
    } catch (err) {
      res.send({
        code: constant.error_code,
        message: err.message,
      });
    }
}

exports.delete_sub_admin = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let option = { new: true };
    let newValue =  {
                      $set: {
                        is_deleted: true,
                        deleted_by_id: req.userId,
                        jwtToken: null,
                        jwtTokenMobile: null,
                        webSocketId: null,
                        socketId: null
                      },
                    };


    let deleteSubAdmin = await USER.findOneAndUpdate( criteria, newValue, option);
    if (!deleteSubAdmin) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.subadminDeleteError'),
      });
    } else {

      // Update its driver as its company deleted by admin
      let updateDriver = await driver_model.findOneAndUpdate(
                                                              { email: deleteSubAdmin.email },
                                                              {
                                                                $set: {
                                                                        isCompanyDeleted: true,
                                                                      },
                                                              }
                                                            );

      sendAccountDeactivationEmail(deleteSubAdmin)

      res.send({
        code: constant.success_code,
        message: deleteSubAdmin?.role == constant.ROLES.HOTEL ? res.__('addSubAdmin.success.hotelAccountDeleted'): res.__('addSubAdmin.success.subAdminAccountDeleted'),
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.restoreSubAdmin = async (req, res) => {
  try {

    let data = req.body;
    let criteria = { _id: req.params.id };
    let option = { new: true };
    let newValue =  {
                      $set: {
                        is_deleted: false,
                      },
                    };


    let updateSubAdmin = await USER.findOneAndUpdate( criteria, newValue, option);

    if (!updateSubAdmin) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.unableToRestore'),
      });
    } else {

      // Update its driver as its company rstore by admin
      let updateDriver = await driver_model.findOneAndUpdate(
                                                              { email: updateSubAdmin.email },
                                                              {
                                                                $set: {
                                                                        isCompanyDeleted: false,
                                                                      },
                                                              }
                                                            );

      sendAccountReactivationEmail(updateSubAdmin);

      return res.send({
                        code: constant.success_code,
                        message: res.__('addSubAdmin.success.subAdminAccountRestored'),
                      });
    }
  } catch (err) {
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}

// exports.add_vehicle_type = async(req,res)=>{
//     try{

//     }catch(err){
//         res.send({
//             code:constant.error_code,
//             message:err.message
//         })
//     }
// }

exports.search_company = async (req, res) => {
  try {
    let data = req.body;
    let query = req.query.role ? req.query.role : "COMPANY";
    let searchUser = await USER.aggregate([
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "meta",
        },
      },
      {
        $match: {
          $and: [
            { role: query },
            { is_deleted: false },
            { created_by: new mongoose.Types.ObjectId(req.userId) },
            {
              $or: [
                { "meta.company_id": { $regex: req.body.name, $options: "i" } },
                {
                  "meta.company_name": { $regex: req.body.name, $options: "i" },
                },
                { first_name: { $regex: req.body.name, $options: "i" } },
                { last_name: { $regex: req.body.name, $options: "i" } },
                { email: { $regex: req.body.name, $options: "i" } },
                // { 'email': { '$regex': req.body.name, '$options': 'i' } },
                { phone: { $regex: req.body.name, $options: "i" } },
              ],
            },
          ],
        },
      },
      {// for sorting with comapny name wit case insensitive
        $addFields: {
          company_name_lower: {
            $toLower: { $arrayElemAt: ["$meta.company_name", 0] }
          }
        }
      },
      {
        $sort: {
          company_name_lower: 1
        }
      },
      {
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          // company_id:1,
          // company_name:1,
          is_blocked:1,
          phone: 1,
          createdAt: -1,
          profile_image: 1,
          role: 1,
          totalBalance: 1,
          status: 1,
          land: { $arrayElemAt: ["$meta.land", 0] },
          post_code: { $arrayElemAt: ["$meta.post_code", 0] },
          house_number: { $arrayElemAt: ["$meta.house_number", 0] },
          description: { $arrayElemAt: ["$meta.description", 0] },
          affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
          p_number: { $arrayElemAt: ["$meta.p_number", 0] },
          number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
          chamber_of_commerce_number: {
            $arrayElemAt: ["$meta.chamber_of_commerce_number", 0],
          },
          vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
          website: { $arrayElemAt: ["$meta.website", 0] },
          tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
          saluation: { $arrayElemAt: ["$meta.saluation", 0] },
          company_name: { $arrayElemAt: ["$meta.company_name", 0] },
          company_id: { $arrayElemAt: ["$meta.company_id", 0] },
          commision: { $arrayElemAt: ["$meta.commision", 0] },
          hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },

          location: { $arrayElemAt: ["$meta.location", 0] },
        },
      },
    ]);
    if (!searchUser) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noUserFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addSubAdmin.success.companyListRetrieved'),
        result: searchUser,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.companyRevenueDetails = async (req, res) => {
  let data = req.body;
  let companyId = new mongoose.Types.ObjectId(req.params.company_id);
  let companyData = await USER.findOne({ role: "COMPANY", _id: companyId });

  if (!companyId || !companyData) {

    return res.send({
      code: constant.error_code,
      message:  res.__('addSubAdmin.error.invalidCompany'),
    });
  }
  
  let dateQuery = await dateFilter(data );

  console.log(dateQuery)
  // Revenue and tripCount calculations Start
  const companyTripPendingData =  await getComapnyRevenueByStatus(companyId , constant.TRIP_STATUS.PENDING , false , dateQuery); // pending trip
  const companyTripCompletedWithPaymentData =  await getComapnyRevenueByStatus(companyId , constant.TRIP_STATUS.COMPLETED , true , dateQuery); // completed with payment
  const companyTripCompletedWithoutPaymentData =  await getComapnyRevenueByStatus(companyId , constant.TRIP_STATUS.COMPLETED , false , dateQuery); // completed without payment
  const companyTripBookedPaymentData =  await getComapnyRevenueByStatus(companyId , constant.TRIP_STATUS.BOOKED , false , dateQuery); // When driver accepted the trip but not started yet
  const companyTripActivePaymentData =  await getComapnyRevenueByStatus(companyId , constant.TRIP_STATUS.ACTIVE , false , dateQuery); // when driver going to take customer
  // Revenue calculations End
  
  const dateList = await createBarChartDateData(req);
  const tripBarChartResult = await getCompanyTripCountWithLable(companyId , dateList   , constant.TRIP_STATUS.COMPLETED , true);
  // let barCharData = [];

  // if (dateList.length > 0) {

  //   for(let value of dateList){
  //     let newDateQuery = { pickup_date_time: { $gte: value.startDate, $lte: value.endDate } };
  //     const tripData =  await getComapnyRevenueByStatus(companyId , constant.TRIP_STATUS.COMPLETED , true , newDateQuery); // completed with payment
  //     barCharData.push({ label : value.label , tripCount: tripData.tripCount})
  //   }
  // }
  // console.log('dateList---' , dateList)

  return res.send({
                code:constant.success_code,
                // data:data,
                // company_id: companyId,
                dateQuery: dateQuery,
                chartRevenue: [
                  { value: companyTripPendingData.revenue.toFixed(2), label: 'Pending Trips' },
                  { value: companyTripBookedPaymentData.revenue.toFixed(2), label: 'Booked Trips' },
                  { value: companyTripActivePaymentData.revenue.toFixed(2), label: 'Active Trips' },
                  { value: companyTripCompletedWithPaymentData.revenue.toFixed(2), label: 'Completed Trips with Payment' },
                  { value: companyTripCompletedWithoutPaymentData.revenue.toFixed(2), label: 'Completed Trips without Payment' },
                  
                ],
                chartTripCount: [
                  { value: companyTripPendingData.tripCount, label: 'Pending Trips' },
                  { value: companyTripBookedPaymentData.tripCount, label: 'Booked Trips' },
                  { value: companyTripActivePaymentData.tripCount, label: 'Active Trips' },
                  { value: companyTripCompletedWithPaymentData.tripCount, label: 'Completed Trips with Payment' },
                  { value: companyTripCompletedWithoutPaymentData.tripCount, label: 'Completed Trips without Payment' },
                  
                ],
                tripBarChartResult:tripBarChartResult,
                // dateQuery:dateQuery,
                
            })
}

exports.driverRevenueDetails = async (req, res) => {
  let data = req.body;
  let driverId = new mongoose.Types.ObjectId(req.params.driver_id);
  let driverData = await DRIVER.findOne({ _id: driverId });

  if (!driverId || !driverData) {

    return res.send({
      code: constant.error_code,
      message: res.__('addSubAdmin.error.invalidCompany'),
    });
  }
  
  let dateQuery = await dateFilter(data );

  console.log(dateQuery)
  // Revenue and tripCount calculations Start
  const companyTripPendingData =  await getDriverRevenueByStatus(driverId , constant.TRIP_STATUS.PENDING , false , dateQuery); // pending trip
  const companyTripCompletedWithPaymentData =  await getDriverRevenueByStatus(driverId , constant.TRIP_STATUS.COMPLETED , true , dateQuery); // completed with payment
  const companyTripCompletedWithoutPaymentData =  await getDriverRevenueByStatus(driverId , constant.TRIP_STATUS.COMPLETED , false , dateQuery); // completed without payment
  const companyTripBookedPaymentData =  await getDriverRevenueByStatus(driverId , constant.TRIP_STATUS.BOOKED , false , dateQuery); // When driver accepted the trip but not started yet
  const companyTripActivePaymentData =  await getDriverRevenueByStatus(driverId , constant.TRIP_STATUS.ACTIVE , false , dateQuery); // when driver going to take customer
  // Revenue calculations End
  
  const dateList = await createBarChartDateData(req);
  const tripBarChartResult = await getDriverTripCountWithLable(driverId , dateList   , constant.TRIP_STATUS.COMPLETED , true);
  // let barCharData = [];

  // if (dateList.length > 0) {

  //   for(let value of dateList){
  //     let newDateQuery = { pickup_date_time: { $gte: value.startDate, $lte: value.endDate } };
  //     const tripData =  await getComapnyRevenueByStatus(companyId , constant.TRIP_STATUS.COMPLETED , true , newDateQuery); // completed with payment
  //     barCharData.push({ label : value.label , tripCount: tripData.tripCount})
  //   }
  // }
  // console.log('dateList---' , dateList)

  return res.send({
                code:constant.success_code,
                // data:data,
                // company_id: companyId,
                dateQuery: dateQuery,
                chartRevenue: [
                  { value: companyTripPendingData.revenue.toFixed(2), label: 'Pending Trips' },
                  { value: companyTripBookedPaymentData.revenue.toFixed(2), label: 'Booked Trips' },
                  { value: companyTripActivePaymentData.revenue.toFixed(2), label: 'Active Trips' },
                  { value: companyTripCompletedWithPaymentData.revenue.toFixed(2), label: 'Completed Trips with Payment' },
                  { value: companyTripCompletedWithoutPaymentData.revenue.toFixed(2), label: 'Completed Trips without Payment' },
                  
                ],
                chartTripCount: [
                  { value: companyTripPendingData.tripCount, label: 'Pending Trips' },
                  { value: companyTripBookedPaymentData.tripCount, label: 'Booked Trips' },
                  { value: companyTripActivePaymentData.tripCount, label: 'Active Trips' },
                  { value: companyTripCompletedWithPaymentData.tripCount, label: 'Completed Trips with Payment' },
                  { value: companyTripCompletedWithoutPaymentData.tripCount, label: 'Completed Trips without Payment' },
                  
                ],
                tripBarChartResult:tripBarChartResult,
                // dateQuery:dateQuery,
                
            })
}

exports.hotelRevenueDetails = async (req, res) => {
  let data = req.body;
  let hotelId = new mongoose.Types.ObjectId(req.params.hotel_id);
  let hotelData = await USER.findOne({ role: constant.ROLES.HOTEL, _id: hotelId });

  
  if (!hotelId || !hotelData) {

    return res.send({
      code: constant.error_code,
      message: res.__('addSubAdmin.error.invalidHotel'),
    });
  }
  
  let dateQuery = await dateFilter(data );

  // Revenue and tripCount calculations Start
  const companyTripPendingData =  await getHotelRevenueByStatus(hotelId , constant.TRIP_STATUS.PENDING , false , dateQuery); // pending trip
  const companyTripCompletedWithPaymentData =  await getHotelRevenueByStatus(hotelId , constant.TRIP_STATUS.COMPLETED , true , dateQuery); // completed with payment
  const companyTripCompletedWithoutPaymentData =  await getHotelRevenueByStatus(hotelId , constant.TRIP_STATUS.COMPLETED , false , dateQuery); // completed without payment
  const companyTripBookedPaymentData =  await getHotelRevenueByStatus(hotelId , constant.TRIP_STATUS.BOOKED , false , dateQuery); // When driver accepted the trip but not started yet
  const companyTripActivePaymentData =  await getHotelRevenueByStatus(hotelId , constant.TRIP_STATUS.ACTIVE , false , dateQuery); // when driver going to take customer
  // Revenue calculations End
  
  const dateList = await createBarChartDateData(req);
  const tripBarChartResult = await getHotelTripCountWithLable(hotelId , dateList   , constant.TRIP_STATUS.COMPLETED , true);
  // let barCharData = [];

  // if (dateList.length > 0) {

  //   for(let value of dateList){
  //     let newDateQuery = { pickup_date_time: { $gte: value.startDate, $lte: value.endDate } };
  //     const tripData =  await getComapnyRevenueByStatus(companyId , constant.TRIP_STATUS.COMPLETED , true , newDateQuery); // completed with payment
  //     barCharData.push({ label : value.label , tripCount: tripData.tripCount})
  //   }
  // }
  

  return res.send({
                code:constant.success_code,
                // data:data,
                // company_id: companyId,
                // list: dateList,
                chartRevenue: [
                  { value: companyTripPendingData.revenue, label: 'Pending Trips' },
                  { value: companyTripBookedPaymentData.revenue, label: 'Booked Trips' },
                  { value: companyTripActivePaymentData.revenue, label: 'Active Trips' },
                  { value: companyTripCompletedWithPaymentData.revenue, label: 'Completed Trips with Payment' },
                  { value: companyTripCompletedWithoutPaymentData.revenue, label: 'Completed Trips without Payment' },
                  
                ],
                chartTripCount: [
                  { value: companyTripPendingData.tripCount, label: 'Pending Trips' },
                  { value: companyTripBookedPaymentData.tripCount, label: 'Booked Trips' },
                  { value: companyTripActivePaymentData.tripCount, label: 'Active Trips' },
                  { value: companyTripCompletedWithPaymentData.tripCount, label: 'Completed Trips with Payment' },
                  { value: companyTripCompletedWithoutPaymentData.tripCount, label: 'Completed Trips without Payment' },
                  
                ],
                tripBarChartResult:tripBarChartResult,
                // dateQuery:dateQuery,
                
            })
}

const getHotelTripCountWithLable  = async (hotelId ,dateList , tripStatus , isPaid) => {

  const facets = dateList.reduce((acc, month) => {
    acc[month.label] = [
        { 
            $match: { 
                pickup_date_time: { $gte: new Date(month.startDate), $lte: new Date(month.endDate) },
                hotel_id: hotelId,
                status: true,
                trip_status: tripStatus,
                is_deleted: false,
                is_paid: isPaid
            } 
        },
        // { $count: "tripCount" }

        {
          $group: {
            _id: null,
            totalTrips: { $sum: 1 },
            totalPayments: { $sum: "$companyPaymentAmount" }, // Replace "price" with the field representing payment amount
          },
        },
    ];
    return acc;
  }, {});

  const result = await TRIP.aggregate([
      { $facet: facets }
  ]);

  const monthlyTripCounts = Object.entries(result[0]).map(([label, data]) => ({
      label,
      tripCount: data.length > 0 ? data[0].totalTrips : 0,
      totalRevenue: data.length > 0 ? data[0].totalPayments: 0
  }));

  return monthlyTripCounts;
}

const getCompanyTripCountWithLable  = async (companyId ,dateList , tripStatus , isPaid) => {

  const facets = dateList.reduce((acc, month) => {
    acc[month.label] = [
        { 
            $match: { 
                pickup_date_time: { $gte: new Date(month.startDate), $lte: new Date(month.endDate) },
                created_by_company_id: companyId,
                status: true,
                trip_status: tripStatus,
                is_deleted: false,
                is_paid: isPaid
            } 
        },
        // { $count: "tripCount" }

        {
          $group: {
            _id: null,
            totalTrips: { $sum: 1 },
            totalPayments: { $sum: "$companyPaymentAmount" }, // Replace "price" with the field representing payment amount
          },
        },
    ];
    return acc;
  }, {});

  const result = await TRIP.aggregate([
      { $facet: facets }
  ]);

  const monthlyTripCounts = Object.entries(result[0]).map(([label, data]) => ({
      label,
      tripCount: data.length > 0 ? data[0].totalTrips : 0,
      totalRevenue: data.length > 0 ? data[0].totalPayments: 0
  }));

  return monthlyTripCounts;
}

const getDriverTripCountWithLable  = async (driverId ,dateList , tripStatus , isPaid) => {

  const facets = dateList.reduce((acc, month) => {
    acc[month.label] = [
        { 
            $match: { 
                pickup_date_time: { $gte: new Date(month.startDate), $lte: new Date(month.endDate) },
                driver_name: driverId,
                status: true,
                trip_status: tripStatus,
                is_deleted: false,
                is_paid: isPaid
            } 
        },
        // { $count: "tripCount" }

        {
          $group: {
            _id: null,
            totalTrips: { $sum: 1 },
            totalPayments: { $sum: "$driverPaymentAmount" }, // Replace "price" with the field representing payment amount
          },
        },
    ];
    return acc;
  }, {});

  const result = await TRIP.aggregate([
      { $facet: facets }
  ]);

  const monthlyTripCounts = Object.entries(result[0]).map(([label, data]) => ({
      label,
      tripCount: data.length > 0 ? data[0].totalTrips : 0,
      totalRevenue: data.length > 0 ? data[0].totalPayments: 0
  }));

  return monthlyTripCounts;
}

const createBarChartDateData = async (req) => {

  let list = [];
  const monthNames = [
                          "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                          "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
                      ];

  if (req.body.dateFilter == 'this_year') {

    const currentYear = new Date().getFullYear();
    

    for (let month = 0; month < 12; month++) {
      // Create start and end Date objects
      let startDate = new Date(Date.UTC(currentYear, month, 1)); // Start of the month
      let endDate = new Date(Date.UTC(currentYear, month + 1, 0)); // End of the month

      // Adjust time for start and end dates
      startDate.setUTCHours(0, 0, 1, 0); // 00:00:01.000 UTC
      endDate.setUTCHours(23, 59, 59, 999); // 23:59:59.999 UTC

      // Convert the Date objects to ISO strings
      startDate = startDate.toISOString();
      endDate = endDate.toISOString();

      // Get the month label
      const label = new Date(currentYear, month).toLocaleString('default', { month: 'long' });

      // Add to the months array
      list.push({ label, startDate: new Date(startDate), endDate: new Date(endDate) });
    }
  }

  if (req.body.dateFilter == 'this_month') {

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth(); // 0-indexed (0 = January)
    
    // Get the first and last day of the current month
    const startOfMonth = new Date(year, month, 1);
    const endOfMonth = new Date(year, month + 1, 0); // Last day of the month
    console.log()
    for (let date = startOfMonth; date <= endOfMonth; date.setDate(date.getDate() + 1)) {
        // Create start and end times
        let new_date =  new Date(date)
        new_date.setUTCHours(0, 0, 1, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);
        const startDate = new Date(nextDate);
        startDate.setUTCHours(0, 0, 1, 0); // Set to 18:30:00

        const endDate = new Date(nextDate);
        endDate.setUTCHours(23, 59, 59, 999); // Set to 18:29:59.999

        let endPoint = '';
        let day = date.getDate();

        if (day > 3 && day < 21) {
          endPoint = 'th';
        } else {
          switch (day % 10) {
            case 1: 
              endPoint =  'st';
              break;
            case 2: 
              endPoint =  'nd';
              break;
            case 3: 
            endPoint = 'rd';
            break;
            default: 
            endPoint = 'th';
            break;
          }
        }
        // Format the label (e.g., "2nd Dec")
        const label = `${date.getDate()}${endPoint} ${monthNames[month]}`;

        list.push({
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
            label: label
        });
    }
  }

  if (req.body.dateFilter == 'this_week') {
    const currentDate = new Date();
    // Adjusting to get the first day of the week (Sunday)
    const firstDayOfWeek = currentDate.getDate() - currentDate.getDay();
    

    for (let i = 0; i < 7; i++) {
        const current = new Date(currentDate);
        current.setDate(firstDayOfWeek + i);
        
        // Set the start and end times
        const startDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 0, 0, 1));
        const endDate = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), current.getUTCDate(), 23, 59, 59, 999));
        let endPoint = '';
        let day = startDate.getDate();

        if (day > 3 && day < 21) {
          endPoint = 'th';
        } else {
          switch (day % 10) {
            case 1: 
              endPoint =  'st';
              break;
            case 2: 
              endPoint =  'nd';
              break;
            case 3: 
            endPoint = 'rd';
            break;
            default: 
            endPoint = 'th';
            break;
          }
        }
        list.push({
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            label: `${current.getDate()}${endPoint} ${current.toLocaleString('default', { month: 'short' })}`
        });
    }

  }

  if (req.body.dateFilter == 'dateRange') {

    const startDate = new Date(req.body.startDate);
    const endDate = new Date(req.body.endDate);

    // Ensure endDate is after startDate
    if (endDate < startDate) {
        throw new Error("End date must be after start date.");
    }

    // Loop through each day between the start and end dates
    for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
        const startOfDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 1));
        const endOfDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));

        let day = startOfDay.getDate();

        if (day > 3 && day < 21) {
          endPoint = 'th';
        } else {
          switch (day % 10) {
            case 1: 
              endPoint =  'st';
              break;
            case 2: 
              endPoint =  'nd';
              break;
            case 3: 
            endPoint = 'rd';
            break;
            default: 
            endPoint = 'th';
            break;
          }
        }
        list.push({
            startDate: startOfDay.toISOString(),
            endDate: endOfDay.toISOString(),
            label: `${d.getUTCDate()}${endPoint} ${d.toLocaleString('default', { month: 'short' })}`
        });
    }

  }
  
  return list;
}

const getHotelRevenueByStatus = async (hotelId ,tripStatus  = constant.TRIP_STATUS.PENDING, paidStatus = false , dateQuery = {}) => {

  let matchCompletedPaidCriteria = {
    $and: [
      { hotel_id : hotelId},
      { status: true },
      { trip_status: tripStatus },
      { is_deleted: false },
      {is_paid: paidStatus},
      
    ],
  };

  if (dateQuery) {
    matchCompletedPaidCriteria.$and.push(dateQuery);
  }

  const result = await TRIP.aggregate([
    {
        $match: matchCompletedPaidCriteria
    },
    {
        $group: {
            _id: null,
            companyPaymentAmount: { $sum: "$companyPaymentAmount" },
            tripCount: { $sum: 1 }
        }
    }
  ]);

  // console.log('matchCompletedPaidCriteria------' , matchCompletedPaidCriteria , result)
  return { revenue: result.length > 0 ? result[0].companyPaymentAmount : 0 , tripCount: result.length > 0 ? result[0].tripCount : 0 };
}

const getComapnyRevenueByStatus = async (companyId ,tripStatus  = constant.TRIP_STATUS.PENDING, paidStatus = false , dateQuery = {}) => {

  let matchCompletedPaidCriteria = {
    $and: [
      { created_by_company_id : companyId},
      { status: true },
      { trip_status: tripStatus },
      { is_deleted: false },
      {is_paid: paidStatus},
      
    ],
  };

  if (dateQuery) {
    matchCompletedPaidCriteria.$and.push(dateQuery);
    console.log('dateQuery-------' , Object.keys(dateQuery).length)
  }
  
  console.log('matchCompletedPaidCriteria------' , JSON.stringify(matchCompletedPaidCriteria))

  const result = await TRIP.aggregate([
    {
        $match: matchCompletedPaidCriteria
    },
    {
        $group: {
            _id: null,
            companyPaymentAmount: { $sum: "$companyPaymentAmount" },
            tripCount: { $sum: 1 }
        }
    }
  ]);

  // console.log('matchCompletedPaidCriteria------' , matchCompletedPaidCriteria , result)
  return { revenue: result.length > 0 ? result[0].companyPaymentAmount : 0 , tripCount: result.length > 0 ? result[0].tripCount : 0 };
}

const getDriverRevenueByStatus = async (driverId ,tripStatus  = constant.TRIP_STATUS.PENDING, paidStatus = false , dateQuery = {}) => {

  let matchCompletedPaidCriteria = {
    $and: [
      { driver_name : driverId},
      { status: true },
      { trip_status: tripStatus },
      { is_deleted: false },
      {is_paid: paidStatus},
      
    ],
  };

  if (dateQuery) {
    matchCompletedPaidCriteria.$and.push(dateQuery);
    console.log('dateQuery-------' , Object.keys(dateQuery).length)
  }
  
  console.log('matchCompletedPaidCriteria------' , JSON.stringify(matchCompletedPaidCriteria))

  const result = await TRIP.aggregate([
    {
        $match: matchCompletedPaidCriteria
    },
    {
        $group: {
            _id: null,
            companyPaymentAmount: { $sum: "$driverPaymentAmount" },
            tripCount: { $sum: 1 }
        }
    }
  ]);

  // console.log('matchCompletedPaidCriteria------' , matchCompletedPaidCriteria , result)
  return { revenue: result.length > 0 ? result[0].companyPaymentAmount : 0 , tripCount: result.length > 0 ? result[0].tripCount : 0 };
}

exports.companyList = async (req, res) => {
  try {
    let data = req.body;
    let query = req.query.role ? req.query.role : constant.ROLES.COMPANY;
    const page = parseInt(data.page) || 1; // Get the page number from the request (default to 1 if not provided)
    const limit =  parseInt(data.limit); // Number of items per page
    const skip = (page - 1) * limit;
    const searchText = req.body.name.trim();
    const searchWords = searchText.split(/\s+/);
    // Match criteria for filtering users
    
    const matchCriteria = {
      $and: [
        { role: constant.ROLES.COMPANY },
        { is_deleted: data?.is_deleted },
        {
          $or: [
            { "meta.company_id": { $regex: searchText, $options: "i" } },
            { "meta.company_name": { $regex: searchText, $options: "i" } },
            { email: { $regex: searchText, $options: "i" } },
            { phone: { $regex: searchText, $options: "i" } },
            // Partial Matching on Full Name
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
            }
          ]
        }
      ]
    };

    // Get the total count of matching documents
    const totalCount = await USER.aggregate([
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "meta",
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver_info",
        },
      },
      {
        $match: matchCriteria,
      },
      {
        $count: "total",
      },
    ]);

    // Calculate total pages
    const totalDocuments = totalCount[0]?.total || 0;
    const totalPages = Math.ceil(totalDocuments / limit);

    let searchUser = await USER.aggregate([
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "meta",
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver_info",
        },
      },
      {
        $lookup: {
          from: "trips",
          localField: "_id",
          foreignField: "created_by_company_id",
          as: "trip_data"
        }
      },
      {
        $match: matchCriteria,
      },
      {
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          // company_id:1,
          // company_name:1,
          phone: 1,
          countryCode:1,
          createdAt: -1,
          profile_image: 1,
          role: 1,
          totalBalance: 1,
          is_special_plan_active:1,
          status: 1,
          is_deleted:1,
          isDriver:1,
          is_blocked:1,
          land: { $arrayElemAt: ["$meta.land", 0] },
          post_code: { $arrayElemAt: ["$meta.post_code", 0] },
          house_number: { $arrayElemAt: ["$meta.house_number", 0] },
          description: { $arrayElemAt: ["$meta.description", 0] },
          affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
          p_number: { $arrayElemAt: ["$meta.p_number", 0] },
          number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
          chamber_of_commerce_number: {
            $arrayElemAt: ["$meta.chamber_of_commerce_number", 0],
          },
          vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
          website: { $arrayElemAt: ["$meta.website", 0] },
          tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
          saluation: { $arrayElemAt: ["$meta.saluation", 0] },
          company_name: { $arrayElemAt: ["$meta.company_name", 0] },
          company_id: { $arrayElemAt: ["$meta.company_id", 0] },
          commision: { $arrayElemAt: ["$meta.commision", 0] },
          hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },

          location: { $arrayElemAt: ["$meta.location", 0] },
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver_info.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver_info.last_name", 0] },
            ],
          },
        },
      },
      {
        // Add lowercase version of company_name for case-insensitive sorting
        $addFields: {
          company_name_lower: { $toLower: "$company_name" },
        },
      },
      {
        $sort: { company_name_lower: 1 }, // Sort by creation date in descending order
      },
      {
        $skip: skip, // Skip items for previous pages
      },
      {
        $limit: limit, // Limit the result to items per page
      },
    ]);
    if (!searchUser) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noMatchingRecords'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addSubAdmin.success.companyListRetrieved'),
        totalCount: totalCount,
        totalDocuments:totalDocuments,
        totalPages:totalPages,
        result: searchUser,
        matchCriteria
        
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};


exports.companyListByRevenue = async (req, res) => {
  try {
    let data = req.body;
    let query = req.query.role ? req.query.role : constant.ROLES.COMPANY;
    const page = parseInt(data.page) || 1; // Get the page number from the request (default to 1 if not provided)
    const limit =  parseInt(data.limit); // Number of items per page
    const skip = (page - 1) * limit;
    
    const searchText = req.body.name.trim();
    const searchWords = searchText.split(/\s+/);
    const isCompanyPaid = req.body?.commision_paid;

    let dateQuery = await dateFilter(data );

    
    // Match criteria for filtering users
    
    const matchCriteria = {
      $and: [
        { role: constant.ROLES.COMPANY },
        {
          "trip_data": {
            $elemMatch: {
              trip_status: constant.TRIP_STATUS.COMPLETED,
              is_company_paid: isCompanyPaid,
              ...(dateQuery?.pickup_date_time ? dateQuery : {})
            }
          }
        },
      ]
    };

    // Total Count with filters
    const totalCount = await USER.aggregate([
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "meta"
        }
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver_info"
        }
      },
      {
        $lookup: {
          from: "trips",
          localField: "_id",
          foreignField: "created_by_company_id",
          as: "trip_data"
        }
      },
      { $match: matchCriteria },
      { $count: "total" }
    ]);

    // Calculate total pages
    const totalDocuments = totalCount[0]?.total || 0;
    const totalPages = Math.ceil(totalDocuments / limit);

    // Paginated data with total_paid_trip_amount
    const searchUser = await USER.aggregate([
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "meta"
        }
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driverId",
          foreignField: "_id",
          as: "driver_info"
        }
      },
      {
        $lookup: {
          from: "trips",
          localField: "_id",
          foreignField: "created_by_company_id",
          as: "trip_data"
        }
      },
      { $match: matchCriteria },
      {
        $addFields: {
          total_paid_trip_amount: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: "$trip_data",
                    as: "trip",
                    cond: {
                      $and: [
                        { $eq: ["$$trip.trip_status", constant.TRIP_STATUS.COMPLETED] },
                        { $eq: ["$$trip.is_company_paid", isCompanyPaid] }
                      ]
                    }
                  }
                },
                as: "trip",
                in: "$$trip.companyPaymentAmount" // Change this field if needed
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          phone: 1,
          createdAt: 1,
          profile_image: 1,
          role: 1,
          totalBalance: 1,
          is_special_plan_active: 1,
          status: 1,
          is_deleted: 1,
          isDriver: 1,
          is_blocked: 1,
          total_paid_trip_amount: 1,

          land: { $arrayElemAt: ["$meta.land", 0] },
          post_code: { $arrayElemAt: ["$meta.post_code", 0] },
          house_number: { $arrayElemAt: ["$meta.house_number", 0] },
          description: { $arrayElemAt: ["$meta.description", 0] },
          affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
          p_number: { $arrayElemAt: ["$meta.p_number", 0] },
          number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
          chamber_of_commerce_number: {
            $arrayElemAt: ["$meta.chamber_of_commerce_number", 0]
          },
          vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
          website: { $arrayElemAt: ["$meta.website", 0] },
          tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
          saluation: { $arrayElemAt: ["$meta.saluation", 0] },
          company_name: { $arrayElemAt: ["$meta.company_name", 0] },
          company_id: { $arrayElemAt: ["$meta.company_id", 0] },
          commision: { $arrayElemAt: ["$meta.commision", 0] },
          hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },
          location: { $arrayElemAt: ["$meta.location", 0] },

          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver_info.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver_info.last_name", 0] }
            ]
          }
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);
    if (!searchUser) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noMatchingRecords'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addSubAdmin.success.companyListRetrieved'),
        totalCount: totalCount,
        totalDocuments:totalDocuments,
        totalPages:totalPages,
        result: searchUser,
        // matchCriteria
        
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.driverListByRevenue = async (req, res) => {
  try {
    let data = req.body;
    const page = parseInt(data.page) || 1; // Get the page number from the request (default to 1 if not provided)
    const limit =  parseInt(data.limit); // Number of items per page
    const skip = (page - 1) * limit;
    
    const searchText = req.body.name.trim();
    const searchWords = searchText.split(/\s+/);
    const isPaid = req.body?.commision_paid;

    let dateQuery = await dateFilter(data );

    
    // Match criteria for filtering users
    
    const matchCriteria = {
      $and: [
        {
          "trip_data": {
            $elemMatch: {
              trip_status: constant.TRIP_STATUS.COMPLETED,
              is_paid: isPaid,
              ...(dateQuery?.pickup_date_time ? dateQuery : {})
            }
          }
        },
      ]
    };

    const tripMatchExpr  = [
      { $eq: ["$trip_status", constant.TRIP_STATUS.COMPLETED] },
      { $eq: ["$is_paid", isPaid] }
    ];

    // If date filter is coming
    if (Object.keys(dateQuery).length !== 0) {
      
      tripMatchExpr .push(
        { $gte: ["$pickup_date_time", new Date(dateQuery.pickup_date_time?.$gte) ] },
        { $lte: ["$pickup_date_time", new Date(dateQuery.pickup_date_time?.$lte) ] }
      );
    }

    const basePipeline = [
      {
        $lookup: {
          from: "trips",
          localField: "_id",
          foreignField: "driver_name",
          as: "trips",
          pipeline: [
            {
              $match: {
                $expr: { $and: tripMatchExpr }
              }
            }
          ]
        }
      },
      {
        $match: {
          trips: { $elemMatch: { __v: 0 } }
        }
      },
      {
        $addFields: {
          total_paid_trip_amount: {
            $sum: {
              $map: {
                input: "$trips",
                as: "trip",
                in: {
                  $subtract: [
                    { $ifNull: ["$$trip.price", 0] },
                    { $ifNull: ["$$trip.driverPaymentAmount", 0] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "driver_company_id",
          foreignField: "_id",
          as: "meta"
        }
      },
      {
        $addFields: {
          driver_id: "$_id"
        }
      }
    ];

    

    const totalCount = await DRIVER.aggregate([
      ...basePipeline,
      { $count: "total" }
    ]);

    // Calculate total pages
    const totalDocuments = totalCount[0]?.total || 0;
    const totalPages = Math.ceil(totalDocuments / limit);

    const searchUser = await DRIVER.aggregate([
      ...basePipeline,
      {
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          phone: 1,
          createdAt: 1,
          profile_image: 1,
          is_special_plan_active: 1,
          status: 1,
          is_deleted: 1,
          isCompany: 1,
          is_blocked: 1,
          total_paid_trip_amount: 1,
          driver_id:1,
          land: { $arrayElemAt: ["$meta.land", 0] },
          post_code: { $arrayElemAt: ["$meta.post_code", 0] },
          house_number: { $arrayElemAt: ["$meta.house_number", 0] },
          description: { $arrayElemAt: ["$meta.description", 0] },
          affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
          p_number: { $arrayElemAt: ["$meta.p_number", 0] },
          number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
          chamber_of_commerce_number: {
            $arrayElemAt: ["$meta.chamber_of_commerce_number", 0]
          },
          vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
          website: { $arrayElemAt: ["$meta.website", 0] },
          tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
          saluation: { $arrayElemAt: ["$meta.saluation", 0] },
          company_name: { $arrayElemAt: ["$meta.company_name", 0] },
          company_id: { $arrayElemAt: ["$meta.company_id", 0] },
          commision: { $arrayElemAt: ["$meta.commision", 0] },
          hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },
          location: { $arrayElemAt: ["$meta.location", 0] },

          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver_info.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver_info.last_name", 0] }
            ]
          }
        }
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    if (!searchUser) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noMatchingRecords'),
      });
    } else {

      
      res.send({
        code: constant.success_code,
        message: res.__('addSubAdmin.success.driverListRetrieved'),
        totalCount: totalCount,
        totalDocuments:totalDocuments,
        totalPages:totalPages,
        result: searchUser,
        tripMatchExpr 
        
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};


exports.tipListByRevenue = async (req, res) => {
  try {
    let data = req.body;
    let search_value = data.name ? data.name : "";

    let page = parseInt(data.page) || 1; // Current page number, default to 1
    let limit = parseInt(data.limit) || 10; // Number of results per page, default to 10
    let skip = (page - 1) * limit;

    const searchText = data.name.trim();
    // const searchWords = searchText.split(/\s+/);
    const isPaid = req.body?.commision_paid;

    let dateQuery = await dateFilter(data );
    
    let criteria = {
                    $and: [
                            {
                              trip_status : constant.TRIP_STATUS.COMPLETED,
                              is_paid: isPaid, // driver paid the commission
                              ...(dateQuery?.pickup_date_time ? dateQuery : {}),
                              ...(search_value
                                ? {
                                    $or: [
                                      { comment: { $regex: search_value, $options: "i" } },
                                      { "trip_to.address": { $regex: search_value, $options: "i" } },
                                      { "trip_from.address": { $regex: search_value, $options: "i" } },
                                      { company_name: { $regex: search_value, $options: "i" } },
                                      { series_id: { $regex: search_value, $options: "i" } },
                                    ],
                                  }
                                : {}),
                            },
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
          hosted_invoice_url:1,
          payment_collcted:1,
          invoice_pdf:1,
          is_paid:1,
          superAdminPaymentAmount:1,
          companyPaymentAmount:1,
          driverPaymentAmount:1,
          price:1,
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
          driver_id: { $arrayElemAt: ["$driver._id", 0] },
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver.last_name", 0] },
            ],
          },
          vehicle: {
            $concat:  [
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
        message: res.__('getTrip.error.noTripFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('getTrip.success.tripListRetrieved'),
        totalCount :  get_trip[0]?.metadata[0]?.total | 0,
        result: results,
        criteria
        
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.companyTripListRevenue = async (req, res) => {
  try {
    let data = req.body;
    let search_value = data.name ? data.name : "";

    let page = parseInt(data.page) || 1; // Current page number, default to 1
    let limit = parseInt(data.limit) || 10; // Number of results per page, default to 10
    let skip = (page - 1) * limit;

    const searchText = data.name.trim();
    // const searchWords = searchText.split(/\s+/);
    const is_company_paid = req.body?.is_company_paid;

    let dateQuery = await dateFilter(data );
    
    let criteria = {
                    $and: [
                            {
                              trip_status : constant.TRIP_STATUS.COMPLETED,
                              is_company_paid: is_company_paid, // driver paid the commission
                              created_by_company_id: new mongoose.Types.ObjectId(req.userId),
                              ...(dateQuery?.pickup_date_time ? dateQuery : {}),
                              ...(search_value
                                ? {
                                    $or: [
                                      { comment: { $regex: search_value, $options: "i" } },
                                      { "trip_to.address": { $regex: search_value, $options: "i" } },
                                      { "trip_from.address": { $regex: search_value, $options: "i" } },
                                      { company_name: { $regex: search_value, $options: "i" } },
                                      { series_id: { $regex: search_value, $options: "i" } },
                                    ],
                                  }
                                : {}),
                            },
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
          hosted_invoice_url:1,
          payment_collcted:1,
          invoice_pdf:1,
          is_paid:1,
          is_company_paid:1,
          created_by_company_id:1,
          superAdminPaymentAmount:1,
          companyPaymentAmount:1,
          company_name: { $arrayElemAt: ["$userData.company_name", 0] },
          driver_id: { $arrayElemAt: ["$driver._id", 0] },
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver.last_name", 0] },
            ],
          },
          vehicle: {
            $concat:  [
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
        message: res.__('getTrip.error.noTripFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('getTrip.success.tripListRetrieved'),
        totalCount :  get_trip[0]?.metadata[0]?.total | 0,
        result: results,
        criteria
        
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.companyHotelList = async (req, res) => {
  try {
    let data = req.body;
    let companyId = req.params.company_id;
    let companydata = await USER.findOne({ role: constant.ROLES.COMPANY, _id: companyId });

    if (!companyId || !companydata) {

      return res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.invalidCompany'),
      });
    } 

    // Pagination variables
    const page = parseInt(data.page) || 1; // Current page, default is 1
    const limit = parseInt(data.limit) || 10; // Items per page, default is 10
    const skip = (page - 1) * limit;
   
    let searchUser = await USER.aggregate([
    
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "meta",
        },
      },
      {
        $match: {
          $and: [
            { role: 'HOTEL' },
            { is_deleted: false },
            { created_by: new mongoose.Types.ObjectId(companyId) },
            {
              $or: [
                { "meta.company_id": { $regex: req.body.name, $options: "i" } },
                {
                  "meta.company_name": { $regex: req.body.name, $options: "i" },
                },
                { first_name: { $regex: req.body.name, $options: "i" } },
                { last_name: { $regex: req.body.name, $options: "i" } },
                { email: { $regex: req.body.name, $options: "i" } },
                // { 'email': { '$regex': req.body.name, '$options': 'i' } },
                { phone: { $regex: req.body.name, $options: "i" } },
              ],
            },
          ],
        },
      },
      {
        $addFields: {
          sort_company_name: { $toLower: { $arrayElemAt: ["$meta.company_name", 0] } }
        }
      },
      {
        $facet: {
          data: [
            // { $sort: { createdAt: -1 } }, // Sort by creation date
            { $sort: { sort_company_name: 1 } },
            { $skip: skip }, // Skip to the correct page
            { $limit: limit },
            {
              $project: {
                _id: 1,
                first_name: 1,
                last_name: 1,
                email: 1,
                // company_id:1,
                // company_name:1,
                phone: 1,
                createdAt: -1,
                profile_image: 1,
                role: 1,
                totalBalance: 1,
                stored_password:1,
                status: 1,
                land: { $arrayElemAt: ["$meta.land", 0] },
                post_code: { $arrayElemAt: ["$meta.post_code", 0] },
                house_number: { $arrayElemAt: ["$meta.house_number", 0] },
                description: { $arrayElemAt: ["$meta.description", 0] },
                affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
                p_number: { $arrayElemAt: ["$meta.p_number", 0] },
                number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
                chamber_of_commerce_number: {
                  $arrayElemAt: ["$meta.chamber_of_commerce_number", 0],
                },
                vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
                website: { $arrayElemAt: ["$meta.website", 0] },
                tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
                saluation: { $arrayElemAt: ["$meta.saluation", 0] },
                company_name: { $arrayElemAt: ["$meta.company_name", 0] },
                company_id: { $arrayElemAt: ["$meta.company_id", 0] },
                commision: { $arrayElemAt: ["$meta.commision", 0] },
                hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },

                location: { $arrayElemAt: ["$meta.location", 0] },
              },
            },
          ],
          totalCount: [
            {
              $count: "count",
            },
          ],
        }
      }
    ]);

    const results = searchUser[0]?.data || [];
    const totalCount = searchUser[0]?.totalCount[0]?.count || 0;
    const totalPages = Math.ceil(totalCount / limit);
    if (!searchUser) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noUserFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addSubAdmin.success.hotelListRetrieved'),
        totalCount : totalCount,
        totalPages : totalPages,
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

exports.access_search_company = async (req, res) => {
  try {
    if (req.user.role == constant.ROLES.DRIVER) {
      let is_driver_has_company_access = await isDriverHasCompanyAccess(
                                                                          req.user,
                                                                          req.body.company_id
                                                                        );

      if (!is_driver_has_company_access) {
        return res.send({
                          code: constant.ACCESS_ERROR_CODE,
                          message: res.__('auth.error.companyAccessWithdrawn'),
                        });
      }
    }

    let data = req.body;
    let query = req.query.role ? req.query.role : constant.ROLES.COMPANY;
    let searchUser = await USER.aggregate([
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "meta",
        },
      },
      {
        $match: {
          $and: [
            { role: query },
            { is_deleted: false },
            { created_by: new mongoose.Types.ObjectId(req.body.company_id) },
          ],
        },
      },
      {
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          // company_id:1,
          // company_name:1,
          phone: 1,
          createdAt: -1,
          profile_image: 1,
          role: 1,
          totalBalance: 1,
          is_blocked: 1,
          status: 1,
          land: { $arrayElemAt: ["$meta.land", 0] },
          post_code: { $arrayElemAt: ["$meta.post_code", 0] },
          house_number: { $arrayElemAt: ["$meta.house_number", 0] },
          description: { $arrayElemAt: ["$meta.description", 0] },
          affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
          p_number: { $arrayElemAt: ["$meta.p_number", 0] },
          number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
          chamber_of_commerce_number: {
            $arrayElemAt: ["$meta.chamber_of_commerce_number", 0],
          },
          vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
          website: { $arrayElemAt: ["$meta.website", 0] },
          tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
          saluation: { $arrayElemAt: ["$meta.saluation", 0] },
          company_name: { $arrayElemAt: ["$meta.company_name", 0] },
          company_id: { $arrayElemAt: ["$meta.company_id", 0] },
          commision: { $arrayElemAt: ["$meta.commision", 0] },
          hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },

          location: { $arrayElemAt: ["$meta.location", 0] },
        },
      },
    ]).sort({ company_name: 1 });
    if (!searchUser) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noUserFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addSubAdmin.success.companyListRetrieved'),
        result: searchUser,
      });
    }
  } catch (err) {
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.send_request_trip = async (req, res) => {
  try {
    let data = req.body;
    let check_user = await USER.findOne({ _id: req.params.id });
    if (!check_user) {
      res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noUserFound'),
      });
    } else {
      data.created_by = check_user._id;
      data.status = false;
      data.trip_id = randToken.generate(4, "1234567890abcdefghijklmnopqrstuvxyz");
      data.trip_id = "T" + "-" + data.trip_id;
      let save_data = await TRIP(data).save();
      if (!save_data) {
        res.send({
          code: constant.error_code,
          message: res.__('getTrip.error.unableToCreateTripRequest'),
        });
      } else {
        var transporter = nodemailer.createTransport(emailConstant.credentials);
        var mailOptions = {
          from: emailConstant.from_email,
          to: check_user.email,
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
                    <tr class=""><td class="headline">Welcome to iDispatch!</td></tr>
                    <tr>
                    <td>
                    <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                    <td class="" style="color:#444; font-weight: 400;"><br>
                     A property management application that helps you manage your real estate portfolio with ease and efficiency. <br><br>
                      You have successfully been registered to use iDispatch App as a <em>Customer</em><br>
                     <br>
                      Your login credentials are provided below:
                    <br>
                    <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${
                      check_user.email
                    }</span> 
                     <br>
                      <span style="font-weight:bold;">Request Form: &nbsp;</span><span style="font-weight:lighter;" class="">${
                        process.env.email_trip_url + save_data._id
                      }</span>
                    <br><br>  
                    <br></td>
                    </tr> 
                    </tbody></table></center>
                    </td>
                    </tr>
                    <tr>
                    <td class="">
                    <div class="">
                    <a style="background-color:#0682ca;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="${process.env.BASEURL}/login">Visit Account and Start Managing</a>
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
          message: res.__('getTrip.success.tripRequestCreated'),
          result: save_data,
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
exports.favoriteDriver = async (req, res) => {
  try {
    const driverId = req.params.id;
    const driver = await driver_model.findById(driverId);
    if (!driver) {
      return res.send({
        code: constant.error_code,
        message: res.__('getDriverDetail.error.unableToFetchDriverDetails'),
      });
    }
    const user = req.user;
    if (!user.favoriteDrivers.includes(driverId)) {
      await user.updateOne({ $push: { favoriteDrivers: driverId } });
      return res.send({
        code: constant.success_code,
        message: res.__('favoriteDriver.success.driverAdded'),
      });
    } else {
      await user.updateOne({ $pull: { favoriteDrivers: driverId } });
      return res.send({
        code: constant.success_code,
        message: res.__('favoriteDriver.success.driverRemoved'),
      });
    }
  } catch (err) {
    return res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

// Account trafrered or revoked from the driver by company -------------------

exports.update_account_access = async (req, res) => {
  try {

    // USER AGENCY AGENCY
    const driver = await driver_model.findById(req?.body?.driver_id).populate("created_by");

    if (!driver) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('getDriverDetail.error.unableToFetchDriverDetails'),
                      });
    }

    if (req.user?.driverId?._id == req?.body?.driver_id) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('updateAccountAccess.error.selfAssignNotAllowed'),
                      });
    }

    if (req.user?.role == constant.ROLES.COMPANY) {

      let user_detail = await USER.findById(req.user._id);
      let company_detials = await AGENCY.findOne({ user_id: req.user._id });
      let driver_company_detials = await USER.findById(driver.driver_company_id);

      let mesage_data = "";
      let driver_token = driver.deviceToken ? driver.deviceToken : driver_company_detials?.deviceToken;
      

      if (req?.body?.status == constant.ACCOUNT_SHARE_REVOKED) {

        user_detail.company_account_access =user_detail.company_account_access.filter((data) =>data?.driver_id?.toString() != req.body?.driver_id?.toString());
        mesage_data = res.__('updateAccountAccess.success.accountRevokedSuccess');
        driver.company_account_access = driver.company_account_access.filter((data) => data?.company_id?.toString() != req.user._id?.toString());

        if (driver_token != "") {

          const response = await sendNotification(
                                                    driver_token,
                                                    res.__('updateAccountAccess.success.accountRevokedByCompanyMessage', {company_name: company_detials.company_name}),
                                                    res.__('updateAccountAccess.success.accountRevokedByCompanyTitle'),
                                                    company_detials
                                                  );
        }
      } else {

        let is_already_exist = user_detail.company_account_access.filter( (data) => data?.driver_id?.toString() == req.body?.driver_id?.toString() );
        
        if (is_already_exist.length == 0)
          user_detail?.company_account_access.push({ driver_id: req.body.driver_id, }); // Updated if Id is not already exist

        // Checking driver account
        let is_company_already_exist = driver.company_account_access.filter( (data) => data?.company_id?.toString() == req.user._id?.toString() );

        if (is_company_already_exist.length == 0)
          driver?.company_account_access.push({ company_id: req.user._id }); // Updated if Id is not already exist

        mesage_data = res.__('updateAccountAccess.success.accountShareSuccess');

        if (driver_token != "") {
          const response = await sendNotification(
                                                    driver_token,
                                                   res.__('updateAccountAccess.success.accountSharedByCompanyMessage', {company_name: company_detials.company_name}),
                                                    res.__('updateAccountAccess.success.accountSharedByCompanyTitle'),
                                                    company_detials
                                                  );
        }
      }

      const updatedUser = await USER.findByIdAndUpdate(
                                                        req.user._id,
                                                        user_detail,
                                                        { new: true, runValidators: true }
                                                      );
      const updatedDriver = await DRIVER.findByIdAndUpdate(driver._id, driver, {
                                                                                  new: true,
                                                                                  runValidators: true,
                                                                                }
                                                          );

      if (!updatedUser) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('addSubAdmin.error.noUserFound'),
                        });
      } else {
        return res.send({
                          code: constant.success_code,
                          message: mesage_data,
                          driver_details: driver,
                          user_details: updatedUser,
                        });
      }
    } else {
      return res.send({
                        code: constant.error_code,
                        message: res.__('updateAccountAccess.error.accessDenied'),
                      });
    }
  } catch (error) {
    return res.send({
                      code: constant.error_code,
                      message: error.message,
                    });
  }
};

exports.updatePartnerAccountAccess = async (req, res) => {
  try {
    // get the dribver info with its compnay info if it has own company
    const driver  = await driver_model.findById(req?.body?.driver_id)
                                      .populate("driver_company_id");

    // If driver doesn't exist
    if (!driver) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('updateAccountAccess.error.driverNotFound'),
                      });
    }

    if (req.user?.driverId?._id == req?.body?.driver_id) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('updateAccountAccess.error.selfAssignPartnerAccountNotAllowed'),
                        re:req.user
                      });
    }

    

    if (req.user?.role == constant.ROLES.COMPANY) { // if current user role is company

      // Get user , company and driver company details
      let user_detail = await USER.findById(req.user._id);
      let company_detials = await AGENCY.findOne({ user_id: req.user._id });
      let mesage_data = "";

      //  gettting the device token from either driver table or user table when user have both roles (driver as well as company)
      let driverDeviceToken = driver?.deviceToken  ? driver?.deviceToken : driver?.driver_company_id?.deviceToken ;


      // If company wants to remove driver partner access
      if (req?.body?.status == constant.ACCOUNT_SHARE_REVOKED) {

        // Remove partner driver id from company account
        user_detail.parnter_account_access = user_detail.parnter_account_access.filter((data) =>data?.driver_id?.toString() != req.body?.driver_id?.toString());
        mesage_data = res.__('updateAccountAccess.success.accountRevokedSuccess');

        // Remove partner company id from driver account
        driver.parnter_account_access = driver.parnter_account_access.filter((data) => data?.company_id?.toString() != req.user._id?.toString());


        // Send mobile notification if device
        if (driverDeviceToken != "" && driverDeviceToken != null) {

            const response = await sendNotification(
                                                      driverDeviceToken,
                                                      res.__('updateAccountAccess.success.accountRevokedByCompanyMessage' ,{company_name: company_detials.company_name}),
                                                      res.__('updateAccountAccess.success.accountRevokedByCompanyTitle'),
                                                      company_detials
                                                    );
        }

      } else {

        // Check if driver partner already a partner in company account
        let is_already_exist = user_detail.parnter_account_access.filter((data) => data?.driver_id?.toString() == req.body?.driver_id?.toString());

        // If driver partner not already exist then add it into company account
        if (is_already_exist.length == 0) user_detail?.parnter_account_access.push({ driver_id: req.body.driver_id, }); 

        // Check if company partner already a partner in driver account
        let is_company_already_exist = driver.parnter_account_access.filter( (data) => data?.company_id?.toString() == req.user._id?.toString());

        // If company partner not already exist then add it into driver account
        if (is_company_already_exist.length == 0) driver?.parnter_account_access.push({ company_id: req.user._id }); // Updated if Id is not already exist

        mesage_data = res.__('updateAccountAccess.success.accountShareSuccess');

        if (driverDeviceToken != "" && driverDeviceToken != null) {
          const response = await sendNotification(
                                                    driverDeviceToken,
                                                   res.__('updateAccountAccess.success.accountSharedByCompanyMessage' ,{company_name: company_detials.company_name}),
                                                     res.__('updateAccountAccess.success.accountSharedByCompanyTitle'),
                                                    company_detials
                                                  );
        }
      }

      // update company account
      const updatedUser = await USER.findByIdAndUpdate(
                                                        req.user._id,
                                                        user_detail,
                                                        { new: true, runValidators: true }
                                                      );

      // update driver account
      const updatedDriver = await DRIVER.findByIdAndUpdate(
                                                            driver._id, 
                                                            driver, 
                                                            { new: true, runValidators: true, }
                                                          );

      if (!updatedUser) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('addSubAdmin.error.noUserFound'),
                        });
      } else {
        return res.send({
                          code: constant.success_code,
                          message: mesage_data,
                          driver_details: driver,
                          user_details: updatedUser,
                        });
      }
    } else {
      return res.send({
                        code: constant.error_code,
                        message: res.__('updateAccountAccess.error.accessDenied'),
                      });
    }
  } catch (error) {
    return res.send({
                      code: constant.error_code,
                      message: error.message,
                    });
  }
};

exports.get_driver_list = async (req, res) => {
  try {
    const condition = {
                        is_deleted: false,
                        isVerified: true,
                        isDocUploaded: true
                        // _id: { $ne: req.user?.driverId?._id },
                      };

    let driver_list = await DRIVER.find(condition);

    if (driver_list.length == 0) {
      return res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noUserFound'),
      });
    }

    // let access_granted = driver_list.filter(driver =>  req.user.company_account_access.includes(driver._id));

    let access_granted = driver_list.filter((driver) =>
                                                req.user.company_account_access.some(
                                                  (driver_ids) => driver_ids.driver_id.toString() == driver._id.toString()
                                                )
                                              );

    // Get drivers that do not have access
    let access_pending = driver_list.filter(
                                              (driver) =>
                                                !req.user.company_account_access.some(
                                                  (driver_ids) =>
                                                    driver_ids.driver_id.toString() == driver._id.toString()
                                                )
                                            );

    return res.send({
      code: constant.success_code,
      access_granted: access_granted,
      access_pending: access_pending,
      // data: req.user,
    });
  } catch (err) {
    return res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getPartnerDriverList = async (req, res) => {
  try {
    const condition = {
      is_deleted: false,
      isVerified: true,
      isDocUploaded: true,
      _id: { $ne: req.user?.driverId?._id },
    };

    
    let driver_list = await DRIVER.find(condition);

    if (driver_list.length == 0) {
      return res.send({
        code: constant.error_code,
        message: res.__('addSubAdmin.error.noUserFound'),
      });
    }

    // Who have access
    const driverHasCompanyPartnerAccess = await DRIVER.find({
                                                                parnter_account_access : {
                                                                  $elemMatch: { company_id: new mongoose.Types.ObjectId(req.userId) },
                                                                },
                                                              });

    // who doesn't have access
    const driverNotHasCompanyPartnerAccess = await DRIVER.find({
                                                                parnter_account_access: {
                                                                  $not: {
                                                                    $elemMatch: { company_id: new mongoose.Types.ObjectId(req.userId) },
                                                                  },
                                                                },
                                                              });


    if (driverHasCompanyPartnerAccess) {

      return res.send({
                        code: constant.success_code,
                        req:req.user,
                        access_granted: driverHasCompanyPartnerAccess,
                        access_pending: driverNotHasCompanyPartnerAccess
                      });
    } else {

      return res.send({
                        code: constant.error_code,
                        message: res.__('addSubAdmin.error.noDriversFound'),
                      });
    }
    
  } catch (err) {
    return res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};
