const constant = require('../../config/constant');
const DRIVER = require('../../models/user/driver_model'); // Import the Driver model
const USER = require('../../models/user/user_model'); // Import the Driver model
const bcrypt = require("bcrypt");
const multer = require('multer')
const path = require('path')


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
])


exports.add_driver = async (req, res) => {
    driverUpload(req, res, async (err) => {
        try {
            const data = req.body;
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

            let hash = await bcrypt.hashSync(data.password ? data.password : 'Test@123', 10);
            data.password = hash;
            data.created_by = req.userId // Assuming you have user authentication
            data.profile_image = driver_image.length != 0 ? driver_image[0] : 'https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg'
            data.driver_documents = driver_documents.length != 0 ? driver_documents[0] : 'https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg'

            let save_driver = await DRIVER(data).save()
            if (!save_driver) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to save the data"
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: 'Driver created successfully',
                    result: save_driver,
                })
            }
        } catch (err) {
            res.send({
                code: constant.error_code,
                message: err.message
            })
        }
    })

};

exports.remove_driver = async (req, res) => {
    try {
        const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

        // You may want to add additional checks to ensure the driver exists or belongs to the agency user
        const removedDriver = await DRIVER.findOneAndDelete({_id:driverId});
        if(!removedDriver){
            res.send({
                code:constant.error_code,
                message:"Unable to delete the driver"
            })
        }else{
            res.send({
                code:constant.success_code,
                message:"Deleted Successfully"
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
            res.send({
                code: constant.success_code,
                message: "Success",
                result: driver
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
        const drivers = await DRIVER.find(
            {
                $and: [
                    { is_deleted: false },
                    {status:true},
                    {is_available:true}
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
