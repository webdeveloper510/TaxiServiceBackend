const constant = require('../../config/constant');
const DRIVER = require('../../models/user/driver_model'); // Import the Driver model
const USER = require('../../models/user/user_model'); // Import the Driver model
const bcrypt = require("bcrypt");
const multer = require('multer');
const path = require('path');
const nodemailer = require('nodemailer');

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
const emailConstant = require('../../config/emailConstant');
const trip_model = require('../../models/user/trip_model');
const user_model = require('../../models/user/user_model');

const imageStorage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: "TaxiBooking",
        // allowedFormats: ["jpg", "jpeg", "png"],
        public_id: (req, files) =>
            `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
        // format: async (req, file) => "jpg", // Convert all uploaded images to JPEG format
        // transformation: [{ width: 500, height: 500, crop: "limit" }],
        maxFileSize: 10000000,
    },
});

var driverUpload = multer({
    storage: imageStorage
}).any([
    { name: "driver_image" },
    { name: "driver_documents" }
]);


exports.add_driver = async (req, res) => {
    // driverUpload(req, res, async (err) => {
        try {
            const data = req.body;
            var driver_image = []
            var driver_documents = []
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
            const superAdmin = await user_model.findOne({ role: "SUPER_ADMIN"})
            data.created_by = superAdmin // Assuming you have user authentication
             let check_other1 = await DRIVER.findOne({ email: data.email })
            let check_other2 = await DRIVER.findOne({ phone: data.phone })
            if (check_other1) {
                res.send({
                    code: constant.error_code,
                    message: "Email Already exist"
                })
                return
            }
            if (check_other2) {
                res.send({
                    code: constant.error_code,
                    message: "Phone Already exist"
                })
                return
            }
            let save_driver = await DRIVER(data).save()
            if (!save_driver) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to save the data"
                })
            } else {
                // mail
                // var transporter = nodemailer.createTransport(emailConstant.credentials);
                // var mailOptions = {
                //     from: emailConstant.from_email,
                //     to: save_driver.email,
                //     subject: "Welcome mail",
                //     html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN"
                //         "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
                //         <html xmlns="http://www.w3.org/1999/xhtml"><head><meta content="text/html; charset=utf-8" http-equiv="Content-Type"><meta content="width=device-width, initial-scale=1" name="viewport"><title>PropTech Kenya Welcome Email</title><!-- Designed by https://github.com/kaytcat --><!-- Robot header image designed by Freepik.com --><style type="text/css">
                //           @import url(https://fonts.googleapis.com/css?family=Nunito);
                        
                //           /* Take care of image borders and formatting */
                        
                //           img {
                //             max-width: 600px;
                //             outline: none;
                //             text-decoration: none;
                //             -ms-interpolation-mode: bicubic;
                //           }
                //           html{
                //             margin: 0;
                //             padding:0;
                //           }
                        
                //           a {
                //             text-decoration: none;
                //             border: 0;
                //             outline: none;
                //             color: #bbbbbb;
                //           }
                        
                //           a img {
                //             border: none;
                //           }
                        
                //           /* General styling */
                        
                //           td, h1, h2, h3  {
                //             font-family: Helvetica, Arial, sans-serif;
                //             font-weight: 400;
                //           }
                        
                //           td {
                //             text-align: center;
                //           }
                        
                //           body {
                //             -webkit-font-smoothing:antialiased;
                //             -webkit-text-size-adjust:none;
                //             width: 100%;
                //             height: 100%;
                //             color: #666;
                //             background: #fff;
                //             font-size: 16px;
                //             width: 100%;
                //             padding: 0px;
                //             margin: 0px;
                //           }
                        
                //            table {
                //             border-collapse: collapse !important;
                //           }
                        
                //           .headline {
                //             color: #444;
                //             font-size: 36px;
                //                 padding-top: 10px;
                //           }
                        
                //          .force-full-width {
                //           width: 100% !important;
                //          }
                        
                        
                //           </style><style media="screen" type="text/css">
                //               @media screen {
                //                 td, h1, h2, h3 {
                //                   font-family: 'Nunito', 'Helvetica Neue', 'Arial', 'sans-serif' !important;
                //                 }
                //               }
                //           </style><style media="only screen and (max-width: 480px)" type="text/css">
                //             /* Mobile styles */
                //             @media only screen and (max-width: 480px) {
                        
                //               table[class="w320"] {
                //                 width: 320px !important;
                //               }
                //             }
                //           </style>
                //           <style type="text/css"></style>
                          
                //           </head>
                //           <body bgcolor="#fff" class="body" style="padding:0px; margin:0; display:block; background:#fff;">
                //         <table align="center" cellpadding="0" cellspacing="0" height="100%" width="600px" style="
                //             margin-top: 30px;
                //             margin-bottom: 10px;
                //           border-radius: 10px;
                //          box-shadow: 0px 1px 4px 0px rgb(0 0 0 / 25%);
                //         background:#ccc;
                //           ">
                //         <tbody><tr>
                //         <td align="center" bgcolor="#fff" class="" valign="top" width="100%">
                //         <center class=""><table cellpadding="0" cellspacing="0" class="w320" style="margin: 0 auto;" width="600">
                //         <tbody><tr>
                //         <td align="center" class="" valign="top">
                //         <table bgcolor="#fff" cellpadding="0" cellspacing="0" class="" style="margin: 0 auto; width: 100%; margin-top: 0px;">
                //         <tbody style="margin-top: 5px;">
                //           <tr class="" style="border-bottom: 1px solid #cccccc38;">
                //         <td class="">
                //         </td>
                //         </tr>
                //         <tr class=""><td class="headline">Welcome to Taxi Service!</td></tr>
                //         <tr>
                //         <td>
                //         <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                //         <td class="" style="color:#444; font-weight: 400;"><br>
                //         <br><br>
                //           You have successfully been registered to use Taxi Service as a <em> driver</em><br>
                //          <br>
                //           Your login credentials are provided below:
                //         <br>
                //         <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${save_driver.email}</span> 
                //          <br>
                //           <span style="font-weight:bold;">Password: &nbsp;</span><span style="font-weight:lighter;" class="">${"Test@123"}</span>
                //         <br><br>  
                //         <br></td>
                //         </tr>
                //         </tbody></table></center>
                //         </td>
                //         </tr>
                //         <tr>
                //         <td class="">
                //         <div class="">
                //         <a style="background-color:#ffcc54;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="https://taxi-service-demo.vercel.app/login">Visit Account and Start Managing</a>
                //         </div>
                //          <br>
                //         </td>
                //         </tr>
                //         </tbody>
                          
                //           </table>
                        
                //         <table bgcolor="#fff" cellpadding="0" cellspacing="0" class="force-full-width" style="margin: 0 auto; margin-bottom: 5px:">
                //         <tbody>
                //         <tr>
                //         <td class="" style="color:#444;
                //                             ">
                //         <p>The password was auto-generated, however feel free to change it 
                          
                //             <a href="" style="text-decoration: underline;">
                //               here</a>
                          
                //           </p>
                //           </td>
                //         </tr>
                //         </tbody></table></td>
                //         </tr>
                //         </tbody></table></center>
                //         </td>
                //         </tr>
                //         </tbody></table>
                //         </body></html>`
                // };
                // await transporter.sendMail(mailOptions);
                res.send({
                    code: constant.success_code,
                    message: 'Driver created successfully',
                    result: save_driver,
                })
            }
        } catch (err) {
            console.log("🚀 ~ driverUpload ~ err:", err)
            res.send({
                code: constant.error_code,
                message: err.message
            })
        }
    // })

};

exports.remove_driver = async (req, res) => {
    try {
        const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

        // You may want to add additional checks to ensure the driver exists or belongs to the agency user
        const removedDriver = await DRIVER.findOneAndDelete({ _id: driverId });
        if (!removedDriver) {
            res.send({
                code: constant.error_code,
                message: "Unable to delete the driver"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Deleted Successfully"
            })
        }

    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
};

exports.get_driver_detail = async (req, res) => {
    try {
        const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

        const driver = await DRIVER.findOne({ _id: driverId, is_deleted: false });
        if (!driver) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the detail"
            })
        } else {
            const completedTrips = await trip_model.find({driver_name: driverId, trip_status: "Completed", is_paid: false}).countDocuments();
            const result = driver.toObject();
            result.totalTrips = completedTrips
            res.send({
                code: constant.success_code,
                message: "Success",
                result
            })
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
        let getDetail = await USER.findOne({ _id: req.userId })
        console.log(getDetail)
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
                $match: {
                    is_deleted: false,
                    // status: true,
                    // is_login: true,
                },
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
            {
                $match: {
                    totalUnpaidTrips: 0,
                },
            },
        ]);
        if (driver) {
            res.send({
                code: constant.success_code,
                message: 'Driver list retrieved successfully',
                result: driver,
            });
        } else {
            res.send({
                code: constant.error_code,
                message: 'No drivers found for the agency user',
            });
        }
    } catch (err) {
        console.log("🚀 ~ exports.get_drivers= ~ err:", err)
        res.send({
            code: constant.error_code,
            message: err.message,
        });
    }
};

exports.get_drivers_super = async (req, res) => {
    try {
        const agencyUserId = req.userId; // Assuming you have user authentication and user ID in the request
        let getDetail = await USER.findOne({ _id: req.userId })
        console.log(getDetail)
        const drivers = await DRIVER.find(
            {
                $and: [
                    { is_deleted: false },
                    // {status:true},
                    // {is_available:true}
                    // {
                    //     $or: [
                    //         { created_by: req.userId },
                    //         { created_by: getDetail.created_by }
                    //     ]
                    // }
                ]
            }
        ).sort({ 'createdAt': -1 });

        if (drivers) {
            res.send({
                code: constant.success_code,
                message: 'Driver list retrieved successfully',
                result: drivers,
            });
        } else {
            res.send({
                code: constant.error_code,
                message: 'No drivers found for the agency user',
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

            var driver_image = []
            var driver_documents = []
            // var imagePortfolioLogo = []
            let file = req.files
            for (i = 0; i < file.length; i++) {
                if (file[i].fieldname == 'driver_image') {
                    driver_image.push(file[i].path);
                } else if (file[i].fieldname == 'driver_documents') {
                    driver_documents.push(file[i].path);

                }
            }

            const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter
            const updates = req.body; // Assuming you send the updated driver data in the request body

            // Check if the driver exists
            const existingDriver = await DRIVER.findById(driverId);

            if (!existingDriver || existingDriver.is_deleted) {
                return res.send({
                    code: constant.error_code,
                    message: 'Driver not found',
                });
            }
            req.body.profile_image = driver_image.length != 0 ? driver_image[0] : existingDriver.profile_image
            req.body.driver_documents = driver_documents.length != 0 ? driver_documents[0] : existingDriver.driver_documents
            updates.isDocUploaded = req.body.isDocUploaded == "true"
            if(updates.email != existingDriver.email){
                let check_other1 = await DRIVER.findOne({ email:updates.email })
                if (check_other1) {
                    res.send({
                        code: constant.error_code,
                        message: "Email Already exist with different account"
                    })
                    return
                }
            }
            if(updates.phone != existingDriver.phone){
                let check_other2 = await DRIVER.findOne({ phone: updates.phone })
                if (check_other2) {
                    res.send({
                        code: constant.error_code,
                        message: "Phone Already exist with different account"
                    })
                    return
                }
            }
            const updatedDriver = await DRIVER.findOneAndUpdate({ _id: driverId }, updates, { new: true });
            if (updatedDriver) {
                res.send({
                    code: constant.success_code,
                    message: 'Driver updated successfully',
                    result: updatedDriver,
                });
            }

        } catch (err) {
            res.send({
                code: constant.error_code,
                message: err.message,
            });
        }
    })

};

exports.updateLocation = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: data.driverId };
        let option = { new: true };
        
        let updateLocation = await DRIVER.findOneAndUpdate(criteria,  {
            location: data.location,
            city: data.city
        }, option);
        if (!updateLocation) {
            res.send({
                code: constant.error_code,
                message: "Unable to update the location",
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Updated Successfully",
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}
exports.updateVerification = async (req, res) => {
    try {
       
        const {id} = req.params;
        
        let updateDriver = await DRIVER.findOneAndUpdate({_id: id},  {
           $set: {isVerified: true}
        });
        if (!updateDriver) {
            return res.send({
                code: constant.error_code,
                message: "Unable to update the verification",
            })
        } 
        res.send({
                code: constant.success_code,
                message: "Updated Successfully",
         })
        
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_active_drivers = async(req,res)=>{
    try{
        let getDrivers = await DRIVER.find({status:true,is_login:true}).sort({createdAt:-1})
        if(!getDrivers){
            res.send({
                code:constant.error_code,
                message:"Unable to fetch the drivers"
            })
        }else{
            res.send({
                code:constant.success_code,
                message:"Success",
                result:getDrivers
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}

exports.logout = async(req,res)=>{
    try{
        let data = req.body
        let updateLogin = await DRIVER.findOneAndUpdate({_id:data.driverId},{is_login:false},{new:true})
        if(!updateLogin){
            res.send({
                code:constant.error_code,
                message:"Unable to logout"
            })
        }else{
            res.send({
                code:constant.success_code,
                message:"Logout successfully"
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}