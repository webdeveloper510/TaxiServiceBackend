require("dotenv").config();
const AGENCY = require('../../models/user/agency_model')
const DRIVER = require('../../models/user/driver_model')
const USER = require('../../models/user/user_model')
const VEHICLETYPE = require('../../models/admin/vehicle_type')
var FARES = require('../../models/user/fare_model')
// const FARES = require('../../models/admin/fare_model')
const TRIP = require('../../models/user/trip_model')
const multer = require('multer')
const path = require('path')
const constant = require('../../config/constant')
const geolib = require('geolib')
const mongoose = require('mongoose')
const randToken = require('rand-token').generator()
const moment = require('moment')
const { sendNotification } = require('../../Service/helperFuntion')
const trip_model = require('../../models/user/trip_model')
const user_model = require('../../models/user/user_model')
const { default: axios } = require('axios');
const driver_model = require("../../models/user/driver_model");
const nodemailer = require("nodemailer");
const emailConstant = require("../../config/emailConstant");
const twilio = require('twilio')

const tripIsBooked = async (tripId, io) => {
    console.log("🚀 ~ tripIsBooked ~ tripId:", tripId)
    try {
        const tripById = await trip_model.findOne({ _id: tripId, trip_status: "Accepted" });
        if (tripById) {
            const updateDriver = await driver_model.findByIdAndUpdate(tripById.driver_name, { is_available: true })
            tripById.driver_name = null;
            tripById.trip_status = "Pending";
            await tripById.save()
            const user = await user_model
                .findById(tripById.created_by)
                .populate("created_by");

            if (user.role == "HOTEL") {
                io.to(user?.created_by?.socketId).emit("tripNotAcceptedBYDriver", {
                    trip: tripById,
                    message: "Trip not accepted",
                });
                const response = await axios.post(
                    "https://fcm.googleapis.com/fcm/send",
                    {
                        to: user?.created_by?.deviceToken,
                        notification: {
                            message: `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                            title: `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                            tripById,
                            driver: updateDriver,
                            sound: "default",
                        },
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `key=${process.env.FCM_SERVER_KEY}`,
                        },
                    }
                );
                console.log("🚀 ~ socket.on ~ response:", response);
            } else {
                io.to(user.socketId).emit("tripNotAcceptedBYDriver", {
                    tripById,
                    message: "Trip not accepted successfully",
                });

                const response = await axios.post(
                    "https://fcm.googleapis.com/fcm/send",
                    {
                        to: user?.deviceToken,
                        notification: {
                            message: `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                            title: `Trip not accepted by driver and trip ID is ${tripById.trip_id}`,
                            tripById,
                            driver: driverBySocketId,
                            sound: "default",
                        },
                    },
                    {
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `key=${process.env.FCM_SERVER_KEY}`,
                        },
                    }
                );
                console.log("🚀 ~ socket.on ~ response:", response);
            }
        }
    } catch (err) {
        console.log("🚀 ~ tripIsBooked ~ err:", err)
    }
}

exports.add_trip = async (req, res) => {
    try {
        let data = req.body
        data.created_by = data.created_by ? data.created_by : req.userId
        data.trip_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        let token_code = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        let check_user = await USER.findOne({ _id: req.userId })
        let currentDate = moment().format('YYYY-MM-DD')
        let check_id = await TRIP.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(currentDate),
                        $lt: new Date(new Date(currentDate).getTime() + 24 * 60 * 60 * 1000) // Add 1 day to include the entire day
                    }
                }
            }
        ])
        let series = Number(check_id.length) + 1
        data.series_id = token_code + '-' + '000' + series

        data.trip_id = 'T' + '-' + data.trip_id
        let distance = (geolib.getDistance(
            {
                latitude: data.trip_from.log,
                longitude: data.trip_from.lat,
            },
            {
                latitude: data.trip_to.log,
                longitude: data.trip_to.lat,
            }
        ) * 0.00062137
        ).toFixed(2)

        let getFare = await FARES.findOne({ vehicle_type: data.vehicle_type })
        let fare_per_km = getFare ? Number(getFare.vehicle_fare_per_km ? getFare.vehicle_fare_per_km : 12) : 10
        if (!data.price) {
            data.price = (fare_per_km * Number(distance)).toFixed(2);
        }
        let add_trip = await TRIP(data).save()
        if (!add_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to create the trip"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Saved Successfully",
                result: add_trip
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.add_trip_link = async (req, res) => {
    try {
        let data = req.body
        data.created_by = data.created_by
        data.trip_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        let token_code = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        let currentDate = moment().format('YYYY-MM-DD')
        let check_id = await TRIP.aggregate([{
            $match: {
                createdAt: {
                    $gte: new Date(currentDate),
                    $lt: new Date(new Date(currentDate).getTime() + 24 * 60 * 60 * 1000) // Add 1 day to include the entire day
                }
            }
        }])
        let series = Number(check_id.length) + 1
        data.series_id = token_code + '-' + '000' + series

        data.trip_id = 'T' + '-' + data.trip_id
        let add_trip = await TRIP(data).save()
        if (!add_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to create the trip"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Saved Successfully",
                result: add_trip
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_trip = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.userId)
        let getIds = await USER.find({ role: 'HOTEL', created_by: req.userId })

        let search_value = data.comment ? data.comment : ''
        let ids = []
        for (let i of getIds) {
            ids.push(i._id)
        }
        let dateFilter = data.dateFilter; // Corrected variable name
        if (!["all", "this_week", "this_month", "this_year"].includes(dateFilter)) {
            dateFilter = "all"
        }

        // Update the query based on the date filter
        let dateQuery = {};
        if (dateFilter !== "all") {
            let startDate, endDate;
            const today = new Date();
            switch (dateFilter) {
                case "this_week":
                    const todayDay = today.getDay();
                    startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - todayDay);
                    endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + (6 - todayDay));
                    break;
                case "this_month":
                    startDate = new Date(today.getFullYear(), today.getMonth(), 1);
                    endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                    break;
                case "this_year":
                    startDate = new Date(today.getFullYear(), 0, 1);
                    endDate = new Date(today.getFullYear(), 11, 31);
                    break;
                default:
                    break;
            }
            dateQuery = { createdAt: { $gte: startDate, $lte: endDate } };
        }

        console.log("🚀 ~ exports.get_trip= ~ dateQuery:", dateQuery)

        const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { created_by: { $in: objectIds } },
                                { created_by: mid },
                            ]
                        },
                        { status: true },
                        { trip_status: req.params.status },
                        { is_deleted: false },
                        dateQuery
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
                            $project: {
                                'company_name': { $arrayElemAt: ["$agency.company_name", 0] },
                            }
                        }
                    ]
                }
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
                    status: 1,
                    passenger_detail: 1,
                    vehicle_type: 1,
                    comment: 1,
                    commission: 1,
                    pay_option: 1,
                    customerDetails: 1,
                    price: 1,
                    passengerCount: 1,
                    'company_name': { $arrayElemAt: ["$userData.company_name", 0] },
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
            },
            {
                $match: {
                    $or: [
                        { 'comment': { '$regex': search_value, '$options': 'i' } },
                        { 'trip_id': { '$regex': search_value, '$options': 'i' } },
                        { 'driver_name': { '$regex': search_value, '$options': 'i' } },
                        { 'trip_from.address': { '$regex': search_value, '$options': 'i' } },
                        { 'trip_to.address': { '$regex': search_value, '$options': 'i' } },
                        { 'company_name': { '$regex': search_value, '$options': 'i' } },

                    ]
                }
            }
        ]).sort({ 'createdAt': -1 })
        if (!get_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to get the trips"
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

exports.get_trip_for_hotel = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.userId)
        let search_value = data.comment ? data.comment : ''
        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        { created_by: mid },
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
                $project: {
                    _id: 1,
                    trip_from: 1,
                    trip_to: 1,
                    pickup_date_time: 1,
                    trip_status: 1,
                    vehicle_type: 1,
                    status: 1,
                    commission: 1,
                    comment: 1,
                    pay_option: 1,
                    is_deleted: 1,
                    passenger_detail: 1,
                    createdAt: 1,
                    customerDetails: 1,
                    passengerCount: 1,
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

exports.get_recent_trip = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.userId)
        let getIds = await USER.find({ role: 'HOTEL', created_by: req.userId })
        let ids = []
        for (let i of getIds) {
            ids.push(i._id)
        }
        let search_value = data.comment ? data.comment : ''
        const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { created_by: { $in: objectIds } },
                                { created_by: mid }
                            ]
                        },
                        { 'comment': { '$regex': search_value, '$options': 'i' } },
                        // { trip_status: req.params.status },
                        { is_deleted: false },
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
                            $project: {
                                'company_name': { $arrayElemAt: ["$agency.company_name", 0] },
                            }
                        }
                    ]
                }
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
                    status: 1,
                    passenger_detail: 1,
                    vehicle_type: 1,
                    comment: 1,
                    commission: 1,
                    pay_option: 1,
                    customerDetails: 1,
                    passengerCount: 1,
                    'company_name': { $arrayElemAt: ["$userData.company_name", 0] },
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

exports.get_recent_trip_super = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.userId)
        let search_value = data.comment ? data.comment : ''

        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    is_deleted: false,
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
                            $project: {
                                'company_name': { $arrayElemAt: ["$agency.company_name", 0] },
                            }
                        }
                    ]
                }
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
                    'company_name': { $arrayElemAt: ["$userData.company_name", 0] },
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
            },
            {
                $match: {
                    $or: [
                        { 'comment': { '$regex': search_value, '$options': 'i' } },
                        { 'trip_to.address': { '$regex': search_value, '$options': 'i' } },
                        { 'trip_from.address': { '$regex': search_value, '$options': 'i' } },
                        { 'company_name': { '$regex': search_value, '$options': 'i' } },
                        { 'series_id': { '$regex': search_value, '$options': 'i' } },

                    ]
                }
            }
        ]).sort({ 'createdAt': -1 })
        if (!get_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to get the trips"
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

exports.get_trip_by_company = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.body.trip_id)
        let search_value = data.comment ? data.comment : ''
        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        // { created_by: mid },
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
                $project: {
                    _id: 1,
                    trip_from: 1,
                    trip_to: 1,
                    createdAt: 1,
                    customerDetails: 1,
                    passengerCount: 1,
                    pickup_date_time: 1,
                    trip_status: 1,
                    passenger_detail: 1,
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

exports.alocate_driver = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: req.params.id }
        let check_trip = await TRIP.findOne(criteria)
        if (!check_trip) {
            res.send({
                code: constant.error_code,
                message: "Invalid trip ID"
            })
            return;
        }

        if (data.status != 'Canceled') {
            let check_driver = await DRIVER.findOne({ _id: data.driver_name })
            if (!check_driver) {
                res.send({
                    code: constant.error_code,
                    message: "Driver not available"
                })
                return;
            }
            let newValues = {
                $set: {
                    driver_name: check_driver._id,
                    vehicle: check_driver.defaultVehicle,
                    trip_status: data.status
                }
            }
            if (check_driver._id.toString() == req?.user?.driverId?.toString()) {
                newValues = {
                    $set: {
                        driver_name: check_driver._id,
                        vehicle: check_driver.defaultVehicle,
                        trip_status: "Booked"
                    }
                }
            }
            let option = { new: true }

            let update_trip = await TRIP.findOneAndUpdate(criteria, newValues, option)
            if (!update_trip) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to allocate the driver"
                })
            } else {
                try {

                    if (check_driver._id.toString() != req?.user?.driverId?.toString() && data.status !== "Booked") {
                        await sendNotification(check_driver.deviceToken, "New Trip is allocated have ID " + update_trip.trip_id, "New Trip is allocated have ID " + update_trip.trip_id, update_trip)
                    }
                } catch (error) {
                    console.log("🚀 ~ exports.alocate_driver= ~ error: Unable to send notification", error)

                    //    return res.send({
                    //     code: constant.success_code,
                    //     message: "Driver allocated successfully"
                    // })
                }
                try {
                    console.log("🚀 ~ exports.alocate_driver= ~ check_driver.socketId:", check_driver.socketId, check_driver)
                    if (check_driver._id.toString() != req?.user?.driverId?.toString() && data.status !== "Booked") {
                    req?.io?.to(check_driver.socketId)?.emit("newTrip", { trip: update_trip, company: req.user })
                    }
                } catch (error) {
                    console.log("🚀 ~ exports.alocate_driver= ~ error:", error)

                }

                setTimeout(() => { tripIsBooked(update_trip._id, req.io) }, 20 * 1000)
                res.send({
                    code: constant.success_code,
                    message: "Driver allocated successfully"
                })
            }
        } else {
            let newValues = {
                $set: {
                    trip_status: data.status
                }
            }
            let option = { new: true }

            let update_trip = await TRIP.findOneAndUpdate(criteria, newValues, option)
            if (!update_trip) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to allocate the driver"
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: "Cancelled successfully"
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

exports.get_trip_detail = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.params.id)

        let getData = await TRIP.aggregate([
            {
                $match: {
                    _id: mid
                }
            },
            {
                $lookup: {
                    from: "drivers",
                    localField: "driver_name",
                    foreignField: "_id",
                    as: "driver_info"
                }
            },
            {
                $lookup: {
                    from: "vehicles",
                    localField: "vehicle",
                    foreignField: "_id",
                    as: "vehicle_info"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "created_by",
                    foreignField: "_id",
                    as: "hotel_info"
                }
            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "created_by",
                    foreignField: "user_id",
                    as: "company_detail"
                }
            },
            {
                $project: {
                    'phone': { $arrayElemAt: ["$hotel_info.phone", 0] },
                    'email': { $arrayElemAt: ["$hotel_info.email", 0] },
                    'vehicle': { $arrayElemAt: ["$vehicle_info.vehicle_model", 0] },
                    'driverInfo': { $arrayElemAt: ["$driver_info", 0] },
                    'hotelImage': { $arrayElemAt: ["$hotel_info.profile_image", 0] },
                    'driver_name': {
                        $concat: [
                            { $arrayElemAt: ["$driver_info.first_name", 0] },
                            ' ',
                            { $arrayElemAt: ["$driver_info.last_name", 0] }
                        ]
                    },
                    "hotel_location": { $arrayElemAt: ["$company_detail.hotel_location", 0] },
                    vehicle_model: 1,
                    commission: 1,
                    price: 1,
                    vehicle_type: 1,
                    trip_from: 1,
                    trip_to: 1,
                    trip_id: 1,
                    pickup_date_time: 1,
                    passenger_detail: 1,
                    created_by: 1,
                    is_deleted: 1,
                    status: 1,
                    trip_status: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    pay_option: 1,
                    customerDetails: 1,
                    passengerCount: 1,
                    is_paid: 1,
                }
            }
        ])

        let distance = (geolib.getDistance(
            {
                latitude: getData[0].trip_from.log,
                longitude: getData[0].trip_from.lat,
            },
            {
                latitude: getData[0].trip_to.log,
                longitude: getData[0].trip_to.lat,
            }
        ) * 0.00062137
        ).toFixed(2)

        let getFare = await FARES.findOne({ vehicle_type: getData[0].vehicle_type })
        let fare_per_km = getFare ? Number(getFare.vehicle_fare_per_km) : 10
        if (getData[0].price == 0) {
            getData[0].price = fare_per_km * Number(distance)
        }


        if (!getData[0]) {
            res.send({
                code: constant.error_code,
                message: "Invalid ID"
            })
        } else {
            let getUser = await AGENCY.findOne({ user_id: getData[0].created_by })
            res.send({
                code: constant.success_code,
                message: "Success",
                result: getData[0],
                hotelName: getUser ? getUser.company_name : "N/A"
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_counts_dashboard = async (req, res) => {
    try {
        let data = req.body

        let mid = new mongoose.Types.ObjectId(req.userId)
        let getIds = await USER.find({ role: 'HOTEL', created_by: req.userId })

        let search_value = data.comment ? data.comment : ''
        let ids = []
        for (let i of getIds) {
            ids.push(i._id)
        }
        const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));

        let bookedTrip = await TRIP.aggregate([
            {
                $match: {
                    $and: [

                        { status: true },
                        { trip_status: "Booked" },
                        { is_deleted: false },
                    ]
                }
            },
        ]);
        let completedTrip = await TRIP.aggregate([
            {
                $match: {
                    $and: [

                        { status: true },
                        { trip_status: "Completed" },
                        { is_deleted: false },
                    ]
                }
            },
        ]);
        let pendingTrip = await TRIP.aggregate([
            {
                $match: {
                    $and: [

                        { status: true },
                        { trip_status: "Pending" },
                        { is_deleted: false },
                    ]
                }
            },
        ]);
        let cancelTrip = await TRIP.aggregate([
            {
                $match: {
                    $and: [

                        { status: true },
                        { trip_status: "Canceled" },
                        { is_deleted: false },
                    ]
                }
            },
        ]);
        let companyCount = await USER.find({ role: 'COMPPANY' }).countDocuments();
        res.send({
            code: constant.success_code,
            message: "success",
            result: {
                bookedTrips: bookedTrip.length,
                cancelTrips: cancelTrip.length,
                pendingTrip: pendingTrip.length,
                completedTrip: completedTrip.length,
                companies: companyCount,
            }
        })
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}


exports.add_trip1 = async (req, res) => {
    try {
        let data = req.body
        data.created_by = data.created_by
        data.trip_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        let token_code = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        // let check_user = await USER.findOne({ _id: req.userId })
        let currentDate = moment().format('YYYY-MM-DD')
        let check_id = await TRIP.aggregate([
            {
                $match: {
                    createdAt: {
                        $gte: new Date(currentDate),
                        $lt: new Date(new Date(currentDate).getTime() + 24 * 60 * 60 * 1000) // Add 1 day to include the entire day
                    }
                }
            }
        ])
        let series = Number(check_id.length) + 1
        data.series_id = token_code + '-' + '000' + series

        data.trip_id = 'T' + '-' + data.trip_id

        let checkCompanyId = await AGENCY.findOne({ company_id: data.company_id })
        if (!checkCompanyId) {
            res.send({
                code: constant.error_code,
                message: "Invalid company ID"
            })
        }

        let distance = (geolib.getDistance(
            {
                latitude: data.trip_from.log,
                longitude: data.trip_from.lat,
            },
            {
                latitude: data.trip_to.log,
                longitude: data.trip_to.lat,
            }
        ) * 0.00062137
        ).toFixed(2)
        console.log("-----------------------------------------------------ssss-12")
        data.created_by = checkCompanyId._id
        let getFare = await FARES.findOne({ vehicle_type: data.vehicle_type })
        let fare_per_km = getFare ? Number(getFare.vehicle_fare_per_km ? getFare.vehicle_fare_per_km : 12) : 10
        if (!data.price) {
            data.price = (fare_per_km * Number(distance)).toFixed(2);
        }
        console.log("-----------------------------------3333333-------------------12")

        let add_trip = await TRIP(data).save()

        var transporter = nodemailer.createTransport(emailConstant.credentials);
        var mailOptions = {
            from: emailConstant.from_email,
            to: data.email,
            subject: "Welcome mail",
            html: `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
            <html xmlns="http://www.w3.org/1999/xhtml">
              <head>
                <meta content="text/html; charset=utf-8" http-equiv="Content-Type" />
                <meta content="width=device-width, initial-scale=1" name="viewport" />
                <title>PropTech Kenya Welcome Email</title>
                <!-- Designed by https://github.com/kaytcat -->
                <!-- Robot header image designed by Freepik.com -->
                <style type="text/css">
                  @import url(https://fonts.googleapis.com/css?family=Nunito);
            
                  /* Take care of image borders and formatting */
            
                  img {
                    max-width: 600px;
                    outline: none;
                    text-decoration: none;
                    -ms-interpolation-mode: bicubic;
                  }
                  html {
                    margin: 0;
                    padding: 0;
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
            
                  td,
                  h1,
                  h2,
                  h3 {
                    font-family: Helvetica, Arial, sans-serif;
                    font-weight: 400;
                  }
            
                  td {
                    text-align: center;
                  }
            
                  body {
                    -webkit-font-smoothing: antialiased;
                    -webkit-text-size-adjust: none;
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
                </style>
                <style media="screen" type="text/css">
                  @media screen {
                    td,
                    h1,
                    h2,
                    h3 {
                      font-family: "Nunito", "Helvetica Neue", "Arial", "sans-serif" !important;
                    }
                  }
                </style>
                <style media="only screen and (max-width: 480px)" type="text/css">
                  /* Mobile styles */
                  @media only screen and (max-width: 480px) {
                    table[class="w320"] {
                      width: 320px !important;
                    }
                  }
                </style>
                <style type="text/css"></style>
              </head>
              <body
                class="body"
                style="padding: 0px; margin: 0; display: block; background: #fff"
              >
                <table
                  align="center"
                  cellpadding="0"
                  cellspacing="0"
                  height="100%"
                  width="600px"
                  style="
                    margin-top: 30px;
                    margin-bottom: 10px;
                    border-radius: 10px;
                    box-shadow: 0px 1px 4px 0px rgb(0 0 0 / 25%);
                    background: #ccc;
                  "
                >
                  <tbody>
                    <tr>
                      <td align="center" bgcolor="#fff" class="" valign="top" width="100%">
                        <center class="">
                          <table
                            cellpadding="0"
                            cellspacing="0"
                            class="w320"
                            style="margin: 0 auto"
                            width="600"
                          >
                            <tbody>
                              <tr>
                                <td align="center" class="" valign="top">
                                  <table
                                    bgcolor="#fff"
                                    cellpadding="0"
                                    cellspacing="0"
                                    class=""
                                    style="margin: 0 auto; width: 100%; margin-top: 0px"
                                  >
                                    <tbody style="margin-top: 5px">
                                      <tr
                                        class=""
                                        style="border-bottom: 1px solid #cccccc38"
                                      >
                                        <td class="">
                                            <img style="width: 40%;" src="https://idispatch.nl/static/media/taxi-logo.561c5ba100d503dd91d6.png" />
                                        </td>
                                      </tr>
                                      <tr class="">
                                        <td class="headline">
                                          Greeting from Taxi Service!
                                        </td>
                                      </tr>
                                      <tr>
                                        <td>
                                          <center class="">
                                            <table
                                              cellpadding="0"
                                              cellspacing="0"
                                              class=""
                                              style="margin: 0 auto"
                                              width="75%"
                                            >
                                              <tbody class="">
                                                <tr class="">
                                                  <td
                                                    class=""
                                                    style="color: #444; font-weight: 400"
                                                  >
                                                    <br />
                                                    <br /><br />
                                                    Greeting from Taxi Service! Your booking
                                                    has been created<br />
                                                    <br />
                                                    by this email:
                                                    <br />
                                                    <span style="font-weight: bold"
                                                      >Email: &nbsp;</span
                                                    ><span
                                                      style="font-weight: lighter"
                                                      class=""
                                                      >${data.email}</span
                                                    >
                                                    <br />
                                                    <br /><br />
                                                    <br />
                                                  </td>
                                                </tr>
                                              </tbody>
                                            </table>
                                          </center>
                                        </td>
                                      </tr>
                                      <tr>
                                        <td class="">
                                          <div class="">
                                            <a
                                              style="
                                                background-color: #ffcc54;
                                                border-radius: 4px;
                                                color: #fff;
                                                display: inline-block;
                                                font-family: Helvetica, Arial, sans-serif;
                                                font-size: 18px;
                                                font-weight: normal;
                                                line-height: 50px;
                                                text-align: center;
                                                text-decoration: none;
                                                width: 350px;
                                                -webkit-text-size-adjust: none;
                                              "
                                              href="https://taxi-service-demo.vercel.app/login"
                                              >Visit Account to check</a
                                            >
                                          </div>
                                          <br />
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
            
                                  <table
                                    bgcolor="#fff"
                                    cellpadding="0"
                                    cellspacing="0"
                                    class="force-full-width"
                                    style="margin: 0 auto; margin-bottom: 5px"
                                  >
                                    <tbody>
                                      <tr>
                                        <td class="" style="color: #444">
                                          <p>
                                            The password was auto-generated, however feel
                                            free to change it
            
                                            <a href="" style="text-decoration: underline">
                                              here</a
                                            >
                                          </p>
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </center>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </body>
            </html>`,
        };
        await transporter.sendMail(mailOptions);

        if (checkCompanyId.isSMS) {
            const accountSid = process.env.accountSid;
            const authToken = process.env.authToken;
            const client = require('twilio')(accountSid, authToken);
            client.messages
                .create({
                    to: data.phone,
                    from: '+3197010204679',
                    body: 'Your booking has been created'
                })

            console.log("chek------------------- twillio code")
        }

        if (!add_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to create the trip"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Saved Successfully",
                result: add_trip
            })
        }

    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.check_company_id = async (req, res) => {
    try {
        let checkCompanyId = await AGENCY.findOne({ company_id: req.params.company_id })
        if (!checkCompanyId) {
            res.send({
                code: constant.error_code,
                message: "Invalid company ID"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: checkCompanyId
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}



// exports.search_trip_room = async(req,res)=>{
//     try{
//         let data = req.body
//         let search_trip = await TRIP.aggregate([

//         ])
//     }catch(err){
//         res.send({
//             code:constant.error_code,
//             message:err.message
//         })
//     }
// }

















