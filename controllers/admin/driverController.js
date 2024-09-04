require("dotenv").config();
const constant = require("../../config/constant");
const DRIVER = require("../../models/user/driver_model"); // Import the Driver model
const USER = require("../../models/user/user_model"); // Import the Driver model
const bcrypt = require("bcrypt");
const multer = require("multer");
const path = require("path");
const nodemailer = require("nodemailer");
const jwt = require("jsonwebtoken");

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
  limits: { fileSize: 100 * 1024 * 1024 }
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
    data.lastUsedToken = new Date()
    data.created_by = superAdmin; // Assuming you have user authentication
    let check_other1 = await DRIVER.findOne({ email: { $regex: data.email, $options: "i" },is_deleted:false });
    let check_other2 = await DRIVER.findOne({ phone: data.phone,is_deleted:false });
    let check_other3 = await user_model.findOne({ email: { $regex: data.email, $options: "i" },is_deleted:false  });
    let check_other4 = await user_model.findOne({ phone: data.phone ,is_deleted:false });
    if (check_other1) {
      res.send({
        code: constant.error_code,
        message: "Email Already exist",
      });
      return;
    }
    if (check_other2) {
      console.log("🚀 ~ //driverUpload ~ check_other2:", check_other2)
      res.send({
        code: constant.error_code,
        message: "Phone Already exist",
      });
      return;
    }
    if (check_other3) {
      res.send({
        code: constant.error_code,
        message: "This email is already registered as a Company. Sign in to register as a driver.",
      });
      return;
    }
    if (check_other4) {
      res.send({
        code: constant.error_code,
        message: "This Phone Number is already registered as a Company. Sign in to register as a driver.",
      });
      return;
    }
    let save_driver = await DRIVER(data).save();
    let jwtToken = jwt.sign(
      { userId: save_driver._id },
      process.env.JWTSECRET,
      { expiresIn: "365d" }
    );
    
    if(data.platform == "mobile"){
      save_driver.jwtTokenMobile = jwtToken;
      save_driver.lastUsedTokenMobile = new Date();
    }else{
      save_driver.jwtToken = jwtToken;
      save_driver.lastUsedToken = new Date();
    }
    await save_driver.save();

    if (!save_driver) {
      res.send({
        code: constant.error_code,
        message: "Unable to save the data",
      });
    } else {
      // mail
      var transporter = nodemailer.createTransport(emailConstant.credentials);
      var mailOptions = {
        from: emailConstant.from_email,
        to: save_driver.email,
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
              Welcome to iDispatch!

We're pleased to inform you that Step 1 of your registration is successfully completed. Next in line is Step 2, where we kindly ask you to upload necessary details and documents. Following this, our team will promptly review your submission.<br>
               <br>
                Your login credentials are provided below:
              <br>
              <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${save_driver.email}</span>
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
              </body></html>`,
      };
      await transporter.sendMail(mailOptions);
      res.send({
        code: constant.success_code,
        message: "Driver created successfully",
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

exports.remove_driver = async (req, res) => {
  try {
    const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

    // You may want to add additional checks to ensure the driver exists or belongs to the agency user
    const removedDriver = await DRIVER.findOneAndUpdate({ _id: driverId }, {
      $set: {
        is_deleted: true
      }
    });

    if (!removedDriver) {
      res.send({
        code: constant.error_code,
        message: "Unable to delete the driver",
      });
    } else {
      let companyData = await user_model.findOne({ email: removedDriver.email, is_deleted: false });
      if (!companyData) {
        res.send({
          code: constant.success_code,
          message: "Deleted Successfully",
        });
      } else {
        companyData.isDriver = false;
        companyData.driverId = null;
        await companyData.save()
        res.send({
          code: constant.success_code,
          message: "Deleted Successfully",
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

exports.get_driver_detail = async (req, res) => {
  try {
    const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

    const driver = await DRIVER.findOne({ _id: driverId, is_deleted: false });
    console.log("🚀 ~ exports.get_driver_detail= ~ driver:", driver)
    if (!driver) {
      res.send({
        code: constant.error_code,
        message: "Unable to fetch the detail",
      });
    } else {
      const completedTrips = await trip_model
        .find({
          driver_name: driverId,
          trip_status: "Completed",
          is_paid: true,
        })
        .countDocuments();
      const result = driver.toObject();
      result.totalTrips = completedTrips;

      // extra data
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      );
      const totalActiveTrips = await trip_model.find({
        driver_name: driverId,
        trip_status: "Active",
      }).countDocuments();
      const totalUnpaidTrips = await trip_model.find({
        driver_name: driverId,
        trip_status: "Completed",
        is_paid: false,
        drop_time: {
          $lte: startOfCurrentWeek,
        },
      }).countDocuments();

      const totalReachedTrip = await trip_model.find({
        driver_name: driverId,
        trip_status: "Reached",
        is_paid: false,
      }).countDocuments();
      res.send({
        code: constant.success_code,
        message: "Success",
        result,
        totalActiveTrips,
        totalUnpaidTrips,
        totalReachedTrip
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
    console.log(getDetail);
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
    // const drivers = await DRIVER.find(
    //     {
    //         $and: [
    //             { is_deleted: false },
    //             { status: true },
    //             // {is_available:true}
    //             // {
    //             //     $or: [
    //             //         { created_by: req.userId },
    //             //         { created_by: getDetail.created_by }
    //             //     ]
    //             // }
    //         ]
    //     }
    // ).sort({ 'createdAt': -1 });
    // const driver = await DRIVER.aggregate([
    //     {
    //         $match:{
    //             is_deleted: false,
    //             status: true ,
    //             is_login:true
    //         }
    //     },
    //     {
    //         $lookup:{
    //             location: "_id",
    //             foreignField: "driver_name",
    //             from: "trips",
    //             as: "tripData",
    //             pipeline: [
    //                 {
    //                     $match: {
    //                         is_paid: "false",
    //                         trip_status: "Completed",
    //                     }
    //                 }
    //             ]
    //         }
    //     },
    //     {
    //         $project: {
    //             totalUnpaidTrips: {
    //                 $size : "$tripData"
    //             }
    //         }
    //     },
    //     {
    //         $match:{
    //             totalUnpaidTrips: 0,
    //         }
    //     }
    // ])
    const driver = await DRIVER.aggregate([
      {
        $match: query,
        //  {
        //     is_deleted: false,
        //     $or:[
        //         { 'email': { '$regex': search, '$options': 'i' } },
        //         { 'phone': { '$regex': search, '$options': 'i' } },
        //         { 'first_name': { '$regex': search, '$options': 'i' } },
        //         { 'address_1': { '$regex': search, '$options': 'i' } },
        //     ]

        //     // status: true,
        //     // is_login: true,
        // },
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
      // {
      //     $match: {
      //         totalUnpaidTrips: 0,
      //     },
      // },
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
        message: "Driver list retrieved successfully",
        result: result,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: "No drivers found for the agency user",
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

exports.get_drivers_super = async (req, res) => {
  try {
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
    const drivers = await DRIVER.find(query)
      .populate("defaultVehicle")
      .sort({ createdAt: -1 });

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
    console.log("file++++44444++++++++", req.files);

    if (err) {
      console.log("🚀 ~ driverUpload ~ err:", err.stack);
      res.send({
        code: constant.error_code,
        message: err.message,
      });
    }
    try {
      var driver_image = [];
      var driver_documents = [];
      // var imagePortfolioLogo = []
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

      if (!existingDriver || existingDriver.is_deleted) {
        return res.send({
          code: constant.error_code,
          message: "Driver not found",
        });
      }
      req.body.profile_image =
        driver_image.length != 0
          ? driver_image[0]
          : existingDriver.profile_image;
      req.body.driver_documents =
        driver_documents.length != 0
          ? driver_documents[0]
          : existingDriver.driver_documents;
      if (updates.isDocUploaded) {
        updates.isDocUploaded = req.body.isDocUploaded == "true";
      }
      if (updates.is_available) {
        updates.is_available = req.body.is_available == "true";
      }
      if (updates.email != existingDriver.email) {
        let check_other1 = await DRIVER.findOne({ email: updates.email });
        if (check_other1) {
          res.send({
            code: constant.error_code,
            message: "Email Already exist with different account",
          });
          return;
        }
      }
      if (updates.phone != existingDriver.phone) {
        let check_other2 = await DRIVER.findOne({ phone: updates.phone });
        if (check_other2) {
          res.send({
            code: constant.error_code,
            message: "Phone Already exist with different account",
          });
          return;
        }
      }
      const updatedDriver = await DRIVER.findOneAndUpdate(
        { _id: driverId },
        updates,
        { new: true }
      );
      if (updatedDriver) {
        console.log("🚀 ~ driverUpload ~ updatedDriver:", updatedDriver, req.body.isDocUploaded)
        if (req.body.isDocUploaded) {
          console.log("in the right zone============>>>>>>>>")
          var transporter = nodemailer.createTransport(emailConstant.credentials);
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
              Thank you for registering with us as a driver. Your driver profile is currently under review. Once approved, you'll receive an email notification and can log in. Thank you for your patience.<br>
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
              </body></html>`,
          };
          await transporter.sendMail(mailOptions);
        }
        res.send({
          code: constant.success_code,
          message: "Driver Updated successfully",
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

exports.updateLocation = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: data.driverId };
    let option = { new: true };

    console.log("location  ____________ >>>>>", data)
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
<img alt="robot picture" class="welcom-logo" src="C:\Users\Richa\Desktop\taxi-app-images\login-logo.png" width="40%">
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
<img alt="robot picture" class="welcom-logo" src="C:\Users\Richa\Desktop\taxi-app-images\login-logo.png" width="40%">
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
    const threeHoursBefore = new Date(currentDate.getTime() - 3 *60 * 60 * 1000);
    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(
      startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
    ); // Set to Monday of current week
    let getDetail = await USER.findOne({ _id: req.userId });
    // let getDrivers = await DRIVER.find({
    //   status: true,
    //   is_login: true,
    //   defaultVehicle: { $ne: null },
    // })
    //   .populate("defaultVehicle")
    //   .sort({ createdAt: -1 });
    let getDrivers = await DRIVER.aggregate([
      {
        $match: {
          status: true,
          is_login: true,
          isVerified: true,
          isDocUploaded: true,
          is_deleted: false,
          defaultVehicle: { $ne: null },
          lastUsedTokenMobile:{$gte:threeHoursBefore},
          // "location.coordinates": { $ne: [null, null] },
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
    let updateLogin1 = await DRIVER.findOneAndUpdate(
      { _id: data.driverId },
      { is_login: false },
      { deviceToken: null },
      { new: true }
    );

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
      }).save();
      let jwtToken = jwt.sign(
        { userId: save_driver._id },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      save_driver.jwtToken = jwtToken;
      const result = save_driver.toObject();
      result.role = "DRIVER";
      req.user.isDriver = true;
      console.log("🚀 ~ driverUpload ~ save_driver:", save_driver._id);
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
    let platform = req.headers.platform;
    let isMobile = platform == "mobile"
    let currentDate = new Date();
    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(
      startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
    ); // Set to Monday of current week
    let user = req.user;

    let driverData = await DRIVER.findOne({ email: user.email, is_deleted: false });
    if (!driverData) {
      res.send({
        code: constant.error_code,
        message: "YOu don not have driver profile",
      });
    } else {
      let jwtToken = jwt.sign(
        { userId: driverData._id },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      const totalUnpaidTrips = await trip_model
        .find({
          driver_name: driverData._id,
          trip_status: "Completed",
          is_paid: false,
          drop_time: {
            $lte: startOfCurrentWeek,
          },
        })
        .countDocuments();
        if(isMobile){
          driverData.jwtTokenMobile = jwtToken;
        driverData.lastUsedTokenMobile = new Date();
        }else{
          driverData.jwtToken = jwtToken;
        driverData.lastUsedToken = new Date();
        }
      driverData.is_login = true
      let result = driverData.toObject();
      await driverData.save();
      result.totalUnpaidTrips = totalUnpaidTrips;
      result.role = "DRIVER";

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

exports.switchToCompany = async (req, res) => {
  try {
    let platform = req.headers.platform;
    let isMobile = platform == "mobile"
    let user = req.user;

    let companyData = await user_model.findOne({ email: user.email, is_deleted: false });
    if (!companyData) {
      res.send({
        code: constant.error_code,
        message: "You don not have company profile",
      });
    } else {
      let jwtToken = jwt.sign(
        { userId: companyData._id },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      const result = companyData.toObject();
      if(isMobile){
        companyData.jwtTokenMobile = jwtToken;
      companyData.lastUsedTokenMobile = new Date();
      }else{
        companyData.jwtToken = jwtToken;
      companyData.lastUsedToken = new Date();
      }
      await companyData.save()
      result.role = "COMPANY";
      result.driver = user
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

exports.deleteDriver = async (req, res) => {
  try {
    let driver = await DRIVER.findOneAndUpdate({ _id: req.params.id }, { is_deleted: true })
    let companyData = await user_model.findOne({ email: driver.email, is_deleted: false });
    if (!companyData) {
      res.send({
        code: constant.success_code,
        message: "Deleted successfully",
      });
    } else {
      companyData.isDriver = false;
      companyData.driverId = null;
      await companyData.save()
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
