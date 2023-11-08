require("dotenv").config()
const constants = require('../../config/constant')
const USER = require('../../models/user/user_model')
const AGENCY = require('../../models/user/agency_model')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const randToken = require('rand-token').generator()
const multer = require('multer')
const path = require('path')
const moment = require('moment')
const constant = require("../../config/constant")
const emailConstant = require('../../config/emailConstant')
const nodemailer = require('nodemailer')

const mongoose = require("mongoose")

exports.create_super_admin = async (req, res) => {
    try {
        let data = req.body
        let checkEmail = await USER.findOne({ email: data.email })
        if (checkEmail) {
            res.send({
                code: constants.error_code,
                message: "Email is already exist!"
            })
            return;
        }
        let checkPhone = await USER.findOne({ phone: data.phone })
        if (checkPhone) {
            res.send({
                code: constants.error_code,
                message: "Phone number is already exist"
            })
            return;
        }
        let hash = await bcrypt.hashSync(data.password, 10)
        data.password = hash
        let save_data = await USER(data).save()
        if (!save_data) {
            res.send({
                code: constants.error_code,
                message: "Unable to save the data"
            })
        } else {
            let jwtToken = jwt.sign({ userId: save_data._id }, process.env.JWTSECRET, { expiresIn: '365d' })
            save_data.jwtToken = jwtToken
            res.send({
                code: constants.success_code,
                message: "Successfully created",
                result: save_data
            })
        }
    } catch (err) {
        res.send({
            code: constants.error_code,
            message: err.message
        })
    }
}

exports.login = async (req, res) => {
    try {
        let data = req.body
        let userData = await USER.findOne(
            {
                $and: [
                    {
                        $or: [{ 'email': data.email }, { 'phone': data.email }]
                    },
                    {
                        status: true
                    },
                    {
                        is_deleted: false
                    }
                ]
            }
        )
        if (!userData) {
            res.send({
                code: constants.error_code,
                message: "Invalid Credentials"
            })
            return;
        }
        let checkPassword = await bcrypt.compare(data.password, userData.password)
        if (!checkPassword) {
            res.send({
                code: constants.error_code,
                message: "Invalid Credentials"
            })
            return;
        }
        let jwtToken = jwt.sign({ userId: userData._id }, process.env.JWTSECRET, { expiresIn: '365d' })
        let getData = await USER.aggregate([
            {
                $match: { _id: new mongoose.Types.ObjectId(userData._id) }

            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "_id",
                    foreignField: "user_id",
                    as: "company_detail"
                }
            },
            { $unwind: "$company_detail" }
        ])
        console.log(getData)
        res.send({
            code: constants.success_code,
            message: "Login Successful",
            result: getData[0] ? getData[0] : userData,
            jwtToken: jwtToken
        })
    } catch (err) {
        res.send({
            code: constants.error_code,
            message: err.message
        })
    }
}

exports.get_token_detail = async (req, res) => {
    try {
        let data = req.body
        const userByID = await USER.findOne({ _id: req.userId })
        let getData = await USER.aggregate([
            {
                $match: { _id: new mongoose.Types.ObjectId(req.userId) }

            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "_id",
                    foreignField: "user_id",
                    as: "company_detail"
                }
            },
            { $unwind: "$company_detail" }
        ])
        if (!userByID) {
            res.send({
                code: constants.error_code,
                message: "Unable to fetch the detail"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: getData[0] ? getData[0] : userByID
            })
        }
    } catch (err) {
        res.send({

            code: constants.error_code,
            message: err.message
        })
    }
}

exports.send_otp = async (req, res) => {
    try {
        let data = req.body
        let check_email = await USER.findOne({
            $and: [
                {
                    $or: [{ 'email': data.email }, { 'phone': data.email }]
                },
                {
                    status: true
                },
                {
                    is_deleted: false
                }
            ]
        })
        if (!check_email) {
            res.send({
                code: constant.error_code,
                message: "Invalid email ID"
            })
        } else {
            data.OTP = randToken.generate(4, '123456789')
            data.otp_expiry = moment().add('minutes', 1).format()
            let updateUser = await USER.findOneAndUpdate({ _id: check_email._id }, data, { new: true })
            if (!updateUser) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to send the otp please try again"
                })
            } else {
                console.log('check+++++++++++', check_email)
                var transporter = nodemailer.createTransport(emailConstant.credentials);
                var mailOptions = {
                    from: emailConstant.from_email,
                    to: check_email.email,
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
    <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${check_email.email}</span> 
     <br>
      <span style="font-weight:bold;">Password: &nbsp;</span><span style="font-weight:lighter;" class="">${data.OTP}</span>
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

                res.send({
                    code: constant.success_code,
                    message: "OTP sent successfully",
                    otp: data.OTP
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

exports.verify_otp = async (req, res) => {
    try {
        let data = req.body
        let checkEmail = await USER.findOne({ email: req.body.email })
        if (!checkEmail) {
            res.send({
                code: constant.error_code,
                message: "Invalid ID"
            })
        } else {
            if (data.OTP != checkEmail.OTP) {
                res.send({
                    code: constant.error_code,
                    message: "Invalid OTP"
                })
                return;
            }
            console.log('current', moment().format(), 'expiry-----', checkEmail.otp_expiry)
            const currentDate = new Date(moment().format());
            // Expiry date
            const expiryDate = new Date(checkEmail.otp_expiry);
            if (expiryDate > currentDate) {
                res.send({
                    code: constant.error_code,
                    message: "Your otp is expired"
                })
                return;
            }

            res.send({
                code: constant.success_code,
                message: "OTP verified successfully"
            })

        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.forgot_password = async (req, res) => {
    try {
        let data = req.body
        let criteria = { email: data.email }
        let check_email = await USER.findOne(criteria)
        if (!check_email) {
            res.send({
                code: constant.error_code,
                message: 'Please enter valid email'
            })
        } else {
            let option = { new: true }
            let hash = bcrypt.hashSync(data.password, 10)
            let newValue = {
                $set: {
                    password: hash,
                    OTP: ''
                }
            }

            let updatePassword = await USER.findOneAndUpdate(criteria, newValue, option)
            if (!updatePassword) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to udpate the password"
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: "Updated Successfully"
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

exports.reset_password = async(req,res)=>{
    try{
        let data = req.body
        let check_email = await USER.findOne({_id:req.userId})
        if(!check_email){
            res.send({
                code:constant.error_code,
                message:"Invalid ID"
            })
        }else{
            let comparePassword = await bcrypt.compare(data.oldPassword,check_email.password)
            if(!comparePassword){
                res.send({
                    code:constant.error_code,
                    message:"Old password is not correct"
                })
            }else{
                let hashedPassword = await bcrypt.hashSync(data.password, 10);
                let newValue = {
                    $set:{
                        password:hashedPassword
                    }
                }
                let criteria = {_id:req.userId}
                let option = {new: true}
                let updateUser = await USER.findOneAndUpdate(criteria,newValue,option)
                if(!updateUser){
                    res.send({
                        code:constant.error_code,
                        message:"Unable to update the password"
                    })
                }else{
                    res.send({
                        code:constant.success_code,
                        message:"Updated Successfully"
                    })
                }
            }
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}




