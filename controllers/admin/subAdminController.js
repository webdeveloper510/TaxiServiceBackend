const USER = require('../../models/user/user_model')
const AGENCY = require('../../models/user/agency_model')
const TRIP = require('../../models/user/trip_model')
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const constant = require('../../config/constant');
const emailConstant = require('../../config/emailConstant')
const randToken = require('rand-token').generator()
const nodemailer = require('nodemailer')
const mongoose = require('mongoose')
require('dotenv').config();

exports.add_sub_admin = async (req, res) => {
    try {
        let data = req.body
        let checkEmail = await USER.findOne({ email: data.email, is_deleted: false })
        if (checkEmail) {
            res.send({
                code: constant.error_code,
                message: "Email is already registered"
            })
            return;
        }
        let checkPhone = await USER.findOne({ phone: data.phone, is_deleted: false })
        if (checkPhone) {
            res.send({
                code: constant.error_code,
                message: "Phone is already exist"
            })
            return;
        }
        // let passwordEmail = randToken.generate(8, '1234567890abcdefghijklmnopqrstuvxyz')
        let passwordEmail = "Test@123"
        let hashedPassword = await bcrypt.hashSync(passwordEmail, 10);
        data.password = hashedPassword

        data.company_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        if (data.role == 'COMPANY') {
            data.company_id = 'C' + '-' + data.company_id
        } else {
            data.company_id = data.company_id
        }
        let check_hotel = await AGENCY.findOne({ company_id: data.company_id })
        if (check_hotel) {
            res.send({
                code: constant.error_code,
                message: "Already exist with this id"
            })
            return;
        }
        // data.role = 'COMPANY'
        data.created_by = req.userId
        let save_data = await USER(data).save()
        if (!save_data) {
            res.send({
                code: constant.error_code,
                message: 'Something went wrong'
            })
        } else {
            let jwtToken = jwt.sign({ userId: save_data._id, email: save_data.email, role: save_data.role }, process.env.JWTSECRET, { expiresIn: '365d' })
            data.user_id = save_data._id

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
                    <img alt="robot picture" class="welcom-logo" src="C:\Users\Richa\Desktop\taxi-app-images\login-logo.png" width="40%">
                    </td>
                    </tr>
                    <tr class=""><td class="headline">Welcome to Taxi Service!</td></tr>
                    <tr>
                    <td>
                    <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                    <td class="" style="color:#444; font-weight: 400;"><br>
                     A property management application that helps you manage your real estate portfolio with ease and efficiency. <br><br>
                      You have successfully been registered to use Taxi Service App as a <em>Customer</em><br>
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
                    <a style="background-color:#ffcc54;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="https://taxi-service-demo.vercel.app/login">Visit Account and Start Managing</a>
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
                    <p>The password was auto-generated, however feel free to change it 
                      
                        <a href="" style="text-decoration: underline;">
                          here</a>
                      
                      </p>
                      </td>
                    </tr>
                    </tbody></table></td>
                    </tr>
                    </tbody></table></center>
                    </td>
                    </tr>
                    </tbody></table>
                    </body></html>`
            };
            await transporter.sendMail(mailOptions);
            console.log(transporter.sendMail(mailOptions))
            // Welcome to Taxi Service, your email is ${data.email} and password is ${passwordEmail}



            let save_meta_data = await AGENCY(data).save()
            save_data.meta = save_meta_data
            res.send({
                code: constant.success_code,
                message: 'Sub admin added successfully',
                result: save_data,
                jwtToken: jwtToken
            })
        }

    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_sub_admins = async (req, res) => {
    try {
        let data = req.body
        let query = req.query.role ? req.query.role : 'COMPANY'

        let get_data = await USER.aggregate([
            {
                $match: { role: query, is_deleted: false, created_by: new mongoose.Types.ObjectId(req.userId) }

            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "_id",
                    foreignField: "user_id",
                    as: "meta"
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
                    phone: 1,
                    createdAt: -1,
                    profile_image: 1,
                    role: 1,
                    status: 1,
                    'land': { $arrayElemAt: ["$meta.land", 0] },
                    'post_code': { $arrayElemAt: ["$meta.post_code", 0] },
                    'house_number': { $arrayElemAt: ["$meta.house_number", 0] },
                    'description': { $arrayElemAt: ["$meta.description", 0] },
                    'affiliated_with': { $arrayElemAt: ["$meta.affiliated_with", 0] },
                    'p_number': { $arrayElemAt: ["$meta.p_number", 0] },
                    'number_of_cars': { $arrayElemAt: ["$meta.number_of_cars", 0] },
                    'chamber_of_commerce_number': { $arrayElemAt: ["$meta.chamber_of_commerce_number", 0] },
                    'vat_number': { $arrayElemAt: ["$meta.vat_number", 0] },
                    'website': { $arrayElemAt: ["$meta.website", 0] },
                    'tx_quality_mark': { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
                    'saluation': { $arrayElemAt: ["$meta.saluation", 0] },
                    'company_name': { $arrayElemAt: ["$meta.company_name", 0] },
                    'company_id': { $arrayElemAt: ["$meta.company_id", 0] },
                    'commision': { $arrayElemAt: ["$meta.commision", 0] },
                    'location': { $arrayElemAt: ["$meta.location", 0] }
                }
            }

        ]).sort({ 'createdAt': -1 });
        if (!get_data) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the data"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: get_data
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_sub_admin_detail = async (req, res) => {
    try {
        let data = req.params
        let check_detail = await USER.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(data.userId),
                }
            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "_id",
                    foreignField: "user_id",
                    as: "meta"
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
                    phone: 1,
                    profile_image: 1,
                    role: 1,
                    status: 1,
                    'land': { $arrayElemAt: ["$meta.land", 0] },
                    'post_code': { $arrayElemAt: ["$meta.post_code", 0] },
                    'house_number': { $arrayElemAt: ["$meta.house_number", 0] },
                    'description': { $arrayElemAt: ["$meta.description", 0] },
                    'affiliated_with': { $arrayElemAt: ["$meta.affiliated_with", 0] },
                    'p_number': { $arrayElemAt: ["$meta.p_number", 0] },
                    'number_of_cars': { $arrayElemAt: ["$meta.number_of_cars", 0] },
                    'chamber_of_commerce_number': { $arrayElemAt: ["$meta.chamber_of_commerce_number", 0] },
                    'vat_number': { $arrayElemAt: ["$meta.vat_number", 0] },
                    'website': { $arrayElemAt: ["$meta.website", 0] },
                    'tx_quality_mark': { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
                    'saluation': { $arrayElemAt: ["$meta.saluation", 0] },
                    'company_name': { $arrayElemAt: ["$meta.company_name", 0] },
                    'company_id': { $arrayElemAt: ["$meta.company_id", 0] },
                    'commision': { $arrayElemAt: ["$meta.commision", 0] },
                    'location': { $arrayElemAt: ["$meta.location", 0] }
                }
            }

        ])
        if (check_detail.length == 0) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the detail"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: check_detail[0]
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.edit_sub_admin = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: req.params.id }
        let option = { new: true }
        let checkSubAdmin = await USER.findOne(criteria)
        if (!checkSubAdmin) {
            res.send({
                code: constant.error_code,
                message: "Invalid ID"
            })
            return;
        }
        let update_data = await USER.findOneAndUpdate(criteria, data, option)
        let criteria2 = { user_id: update_data._id }
        console.log('check+++++++++++++', data)
        let update_data_meta = await AGENCY.findOneAndUpdate(criteria2, data, option)

        if (!update_data) {
            res.send({
                code: constant.error_code,
                message: "Unable to update the data"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Updated Successfull",
                result: update_data
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.delete_sub_admin = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: req.params.id }
        let option = { new: true }
        let newValue = {
            $set: {
                is_deleted: true,
                deleted_by_id: req.userId
            }
        }
        let deleteSubAdmin = await USER.findOneAndUpdate(criteria, newValue, option)
        if (!deleteSubAdmin) {
            res.send({
                code: constant.error_code,
                message: "Unable to delete the sub admin"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Deleted"
            })
        }

    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
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
        let data = req.body
        let query = req.query.role ? req.query.role : 'COMPANY'
        let searchUser = await USER.aggregate([
            {
                $match: {
                    $and: [
                        { role: query }, { is_deleted: false }, { created_by: new mongoose.Types.ObjectId(req.userId) },
                        {
                            $or: [
                                { 'first_name': { '$regex': req.body.name, '$options': 'i' } },
                                { 'last_name': { '$regex': req.body.name, '$options': 'i' } },
                                { 'email': { '$regex': req.body.name, '$options': 'i' } },
                                { 'phone': { '$regex': req.body.name, '$options': 'i' } },

                            ]
                        }
                    ]


                }

            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "_id",
                    foreignField: "user_id",
                    as: "meta"
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
                    phone: 1,
                    createdAt: -1,
                    profile_image: 1,
                    role: 1,
                    status: 1,
                    'land': { $arrayElemAt: ["$meta.land", 0] },
                    'post_code': { $arrayElemAt: ["$meta.post_code", 0] },
                    'house_number': { $arrayElemAt: ["$meta.house_number", 0] },
                    'description': { $arrayElemAt: ["$meta.description", 0] },
                    'affiliated_with': { $arrayElemAt: ["$meta.affiliated_with", 0] },
                    'p_number': { $arrayElemAt: ["$meta.p_number", 0] },
                    'number_of_cars': { $arrayElemAt: ["$meta.number_of_cars", 0] },
                    'chamber_of_commerce_number': { $arrayElemAt: ["$meta.chamber_of_commerce_number", 0] },
                    'vat_number': { $arrayElemAt: ["$meta.vat_number", 0] },
                    'website': { $arrayElemAt: ["$meta.website", 0] },
                    'tx_quality_mark': { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
                    'saluation': { $arrayElemAt: ["$meta.saluation", 0] },
                    'company_name': { $arrayElemAt: ["$meta.company_name", 0] },
                    'company_id': { $arrayElemAt: ["$meta.company_id", 0] },
                    'commision': { $arrayElemAt: ["$meta.commision", 0] },
                    'location': { $arrayElemAt: ["$meta.location", 0] }
                }
            }
        ]).sort({ 'createdAt': -1 })
        if (!searchUser) {
            res.send({
                code: constant.error_code,
                message: "Unable to search the user"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: searchUser
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.send_request_trip = async (req, res) => {
    try {
        let data = req.body
        let check_user = await USER.findOne({ _id: req.params.id })
        if (!check_user) {
            res.send({
                code: constant.error_code,
                message: "No user found with this ID"
            })
        } else {
            data.created_by = check_user._id
            data.status = false;
            let save_data = await TRIP(data).save()
            if (!save_data) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to create the request"
                })
            } else {
                console.log("check++++++++++++++++++++=",save_data)
                var transporter = nodemailer.createTransport(emailConstant.credentials);
                var mailOptions = {
                    from: emailConstant.from_email,
                    to: check_user.email,
                    subject: "Welcome mail",
                    html:`<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
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
                    <img alt="robot picture" class="welcom-logo" src="C:\Users\Richa\Desktop\taxi-app-images\login-logo.png" width="40%">
                    </td>
                    </tr>
                    <tr class=""><td class="headline">Welcome to Taxi Service!</td></tr>
                    <tr>
                    <td>
                    <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                    <td class="" style="color:#444; font-weight: 400;"><br>
                     A property management application that helps you manage your real estate portfolio with ease and efficiency. <br><br>
                      You have successfully been registered to use Taxi Service App as a <em>Customer</em><br>
                     <br>
                      Your login credentials are provided below:
                    <br>
                    <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${check_user.email}</span> 
                     <br>
                      <span style="font-weight:bold;">Request Form: &nbsp;</span><span style="font-weight:lighter;" class="">${process.env.email_trip_url +save_data._id}</span>
                    <br><br>  
                    <br></td>
                    </tr>
                    </tbody></table></center>
                    </td>
                    </tr>
                    <tr>
                    <td class="">
                    <div class="">
                    <a style="background-color:#ffcc54;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="https://taxi-service-demo.vercel.app/login">Visit Account and Start Managing</a>
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
                    <p>The password was auto-generated, however feel free to change it 
                      
                        <a href="" style="text-decoration: underline;">
                          here</a>
                      
                      </p>
                      </td>
                    </tr>
                    </tbody></table></td>
                    </tr>
                    </tbody></table></center>
                    </td>
                    </tr>
                    </tbody></table>
                    </body></html>`
                };
                await transporter.sendMail(mailOptions);
                // console.log(transporter.sendMail(mailOptions))
                res.send({
                    code: constant.error_code,
                    message: "Unable to create the request",
                    result:save_data
                })
            }
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}
