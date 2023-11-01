const constant = require('../../config/constant');
const DRIVER = require('../../models/user/driver_model'); // Import the Driver model
const TRIP = require('../../models/user/trip_model'); // Import the Driver model
const bcrypt = require("bcrypt");
const multer = require('multer')
const path = require('path')
const jwt = require('jsonwebtoken')


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
        public_id: (req, file) =>
            `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
        // format: async (req, file) => "jpg", // Convert all uploaded images to JPEG format
        // transformation: [{ width: 500, height: 500, crop: "limit" }],
        maxFileSize: 10000000,
    },
});

var driverUpload = multer({
    storage: imageStorage
}).single("driver_image")



exports.add_driver = async (req, res) => {
    driverUpload(req, res, async (err) => {
        try {
            const data = req.body;

            let hash = await bcrypt.hashSync(data.password ? data.password : 'Test@123', 10);
            data.password = hash;
            data.created_by = req.userId // Assuming you have user authentication
            data.agency_user_id = req.userId // Assuming you have user authentication
            data.profile_image = req.file ? req.file.path : 'https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg'

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
        const removedDriver = await DRIVER.findById(driverId);

        if (removedDriver) {
            removedDriver.is_deleted = true;
            removedDriver.save();
            res.send({
                code: constant.success_code,
                message: 'Driver deleted successfully',
                result: removedDriver,
            })
        } else {
            res.send({
                code: constant.error_code,
                message: 'Driver not found',
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

        const drivers = await DRIVER.find({ is_deleted: false }).sort({ 'createdAt': -1 });

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
            data.profile_image = req.file ? req.file.filename : existingDriver.profile_image
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

exports.get_trips_for_driver = async (req, res) => {
    try {
        let data = req.body
        let query = req.query
        let params = req.params
        let get_trip = await TRIP.find({driver_name:req.userId})
        if (!get_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the trips"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: get_trip
            })
        }

    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.login_driver = async (req, res) => {
    try {
        let data = req.body
        let check_email = await DRIVER.findOne({ email: data.email })
        console.log(check_email)
        if (!check_email) {
            res.send({
                code: constant.error_code,
                message: "Invalid Credentials"
            })
        } else {
            let check_password = await bcrypt.compare(data.password, check_email.password)
            if (!check_password) {
                res.send({
                    code: constant.error_code,
                    message: "Invalid Credentials"
                })
            } else {
                const token = jwt.sign({ userId: check_email._id, email: check_email.email }, process.env.JWTSECRET, { expiresIn: '1h' })
                res.send({
                    code: constant.success_code,
                    message: "Login Successfully",
                    result: check_email,
                    jwt: token
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