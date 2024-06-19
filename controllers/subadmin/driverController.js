const constant = require('../../config/constant');
const DRIVER = require('../../models/user/driver_model'); // Import the Driver model
const USER = require('../../models/user/user_model'); // Import the Driver model
const TRIP = require('../../models/user/trip_model'); // Import the Driver model
const bcrypt = require("bcrypt");
const multer = require('multer')
const randToken = require('rand-token').generator()
const path = require('path')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')


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
const { get } = require('../../routes/admin');
const trip_model = require('../../models/user/trip_model');
const imageStorage = require('../../config/awss3');

// const imageStorage = new CloudinaryStorage({
//     cloudinary: cloudinary,
//     params: {
//         folder: "TaxiBooking",
//         // allowedFormats: ["jpg", "jpeg", "png"],
//         public_id: (req, file) =>
//             `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
//         // format: async (req, file) => "jpg", // Convert all uploaded images to JPEG format
//         // transformation: [{ width: 500, height: 500, crop: "limit" }],
//         maxFileSize: 10000000,
//     },
// });

var driverUpload = multer({
    storage: imageStorage,
    limits: { fileSize: 100 * 1024 * 1024 }
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

        const driver = await DRIVER.findOne({
            $and: [
                {
                    $or: [
                        { _id: req.userId },
                    ]
                },
                { is_deleted: false }
            ]
        });
        if (!driver) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the detail"
            })
        } else {
            const completedTrips = await trip_model.find({ driver_name: req.userId, trip_status: "Completed", is_paid: true }).countDocuments();
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
            const driverId = req.userId; // Assuming you pass the driver ID as a URL parameter
            const updates = req.body; // Assuming you send the updated driver data in the request body
            console.log(updates)
            // Check if the driver exists
            const existingDriver = await DRIVER.findOne({ _id: driverId });

            if (!existingDriver || existingDriver.is_deleted) {
                return res.send({
                    code: constant.error_code,
                    message: 'Driver not found',
                });
            }
            updates.profile_image = req.file ? req.file.filename : existingDriver.profile_image
            const updatedDriver = await DRIVER.findOneAndUpdate({ _id: driverId }, updates, { new: true });
            if (updatedDriver) {
                res.send({
                    code: constant.success_code,
                    message: 'Driver Updated successfully',
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

exports.reset_password = async (req, res) => {
    try {
        let data = req.body
        let check_id = await DRIVER.findOne({ _id: req.userId })
        if (!check_id) {
            res.send({
                code: constant.success_code,
                message: "Invalid ID"
            })
            return
        }
        let check_password = await bcrypt.compare(data.oldPassword, check_id.password)
        if (!check_password) {
            res.send({
                code: constant.error_code,
                message: "Old password is not correct"
            })
        } else {
            let values = {
                $set: {
                    password: bcrypt.hashSync(data.password, 10)
                }
            }
            let updateData = await DRIVER.findOneAndUpdate({ _id: check_id._id }, values, { new: true })
            if (!updateData) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to update the password"
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: "Updated successfully",
                    checking: updateData.password
                })
            }
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
};

exports.get_trips_for_driver = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.userId)
        // let getIds = await USER.find({ role: 'HOTEL', created_by: req.userId })

        // let search_value = data.comment ? data.comment : ''
        // let ids = []
        // for (let i of getIds) {
        //     ids.push(i._id)
        // }
        // const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
        let search_value = data.comment ? data.comment : ''

        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        { driver_name: mid },
                        { status: true },
                        { trip_status: req.params.status },
                        { is_deleted: false },
                        { 'comment': { '$regex': search_value, '$options': 'i' } },
                    ]
                }
            },
            {
                $lookup: {
                    from: 'drivers',
                    localField: 'driver_name',
                    foreignField: '_id',
                    as: 'driver',
                }
            },
            {
                $lookup: {
                    from: 'vehicles',
                    localField: 'vehicle',
                    foreignField: '_id',
                    as: 'vehicle',
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: 'created_by',
                    foreignField: '_id',
                    as: 'userData',
                    pipeline: [
                        {
                            $lookup: {
                                from: "agencies",
                                localField: "_id",
                                foreignField: "user_id",
                                as: "agency"
                            }
                        },
                        {
                            $unwind: {
                                path: '$agency'
                            }
                        },
                        // {
                        //     $project: {
                        //         'company_name': { $arrayElemAt: ["$agency.company_name", 0] },
                        //         'cvompany_name': { $arrayElemAt: ["$agency.phone", 0] },
                        //     }
                        // }
                    ]
                }
            },
            {
                $unwind: {
                    path: '$userData'
                }
            },
            {
                $project: {
                    _id: 1,
                    // userData: 1,
                    customer_phone: "$userData.phone",
                    trip_from: 1,
                    trip_to: 1,
                    is_paid: 1,
                    pickup_date_time: 1,
                    trip_status: 1,
                    price: 1,
                    createdAt: 1,
                    created_by: 1,
                    status: 1,
                    passenger_detail: 1,
                    vehicle_type: 1,
                    comment: 1,
                    commission: 1,
                    pay_option: 1,
                    company_name: "$userData.agency.company_name",
                    driver_name: {
                        $concat: [
                            { $arrayElemAt: ["$driver.first_name", 0] },
                            " ",
                            { $arrayElemAt: ["$driver.last_name", 0] }
                        ]
                    },
                    vehicle: {
                        $concat: [
                            { $arrayElemAt: ["$vehicle.vehicle_number", 0] },
                            " ",
                            { $arrayElemAt: ["$vehicle.vehicle_model", 0] }
                        ]
                    },
                    trip_id: 1
                }
            }
        ]).sort({ 'createdAt': -1 })
        if (!get_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to get the trips"
            })
        } else {
            let currentDate = new Date();
            let startOfCurrentWeek = new Date(currentDate);
            startOfCurrentWeek.setHours(0, 0, 0, 0);
            startOfCurrentWeek.setDate(
                startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
            );
            const totalActiveTrips = await TRIP
                .find({
                    driver_name: req.userId,
                    trip_status: "Active",
                })
                .countDocuments();
            const totalUnpaidTrips = await TRIP
                .find({
                    driver_name: req.userId,
                    trip_status: "Completed",
                    is_paid: false,
                    drop_time: {
                        $lte: startOfCurrentWeek,
                    },
                })
                .countDocuments();
            res.send({
                code: constant.success_code,
                message: "Success",
                result: get_trip,
                totalActiveTrips,
                totalUnpaidTrips
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
};

exports.login = async (req, res) => {
    try {
        let data = req.body
        let check_phone = await DRIVER.findOne({ email: data.email })
        console.log('check+++++++++++++', check_phone)
        if (!check_phone) {
            res.send({
                code: constant.error_code,
                message: "Invalid Credentials"
            })
            return
        }
        let check_password = await bcrypt.compare(data.password, check_phone.password)

        if (!check_password) {
            res.send({
                code: constant.error_code,
                message: "Invalid Credentials"
            })
        } else {
            let jwtToken = jwt.sign({ userId: check_phone._id }, process.env.JWTSECRET, { expiresIn: '365d' })
            let updateData = await DRIVER.findOneAndUpdate({ _id: check_phone._id }, { OTP: 'A0', jwtToken: jwtToken }, { new: true })
            res.send({
                code: constant.success_code,
                message: "Login Successfully",
                result: updateData,
                jwtToken: jwtToken
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
};

exports.verify_otp = async (req, res) => {
    try {
        let data = req.body
        let check_id = await DRIVER.findOne({ _id: data.driverId })
        if (!check_id) {
            res.send({
                code: constant.error_code,
                message: "Something went wrong, please try again"
            })
        } else {
            let jwtToken = jwt.sign({ userId: check_id._id }, process.env.JWTSECRET, { expiresIn: '365d' })
            let updateData = await DRIVER.findOneAndUpdate({ _id: check_id._id }, { OTP: 'A0', jwtToken: jwtToken }, { new: true })
            if (!updateData) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to process the request"
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: "Login Successfully",
                    result: updateData
                })
            }
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
};

exports.get_reports = async (req, res) => {
    try {
        let data = req.body
        let query;
        if (data.filter_type == "all") {
            query = [
                { status: true },
                { trip_status: "Completed" },
                { driver_name: new mongoose.Types.ObjectId(req.userId) }
            ]

        } else {
            query = [
                { status: true },
                { trip_status: "Completed" },
                { driver_name: new mongoose.Types.ObjectId(req.userId) },
                { pickup_date_time: { $gte: new Date(data.from_date), $lt: new Date(data.to_date) } }
            ]

        }


        let get_data = await TRIP.find({
            $and: query
        }
        )
        const totalPrice = get_data.reduce((sum, obj) => sum + obj.price, 0);
        if (!get_data) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the details"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: {
                    trips: get_data.length,
                    earning: totalPrice
                }
            })
        }

    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

