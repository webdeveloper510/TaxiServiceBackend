const AGENCY = require('../../models/user/agency_model')
const DRIVER = require('../../models/user/driver_model')
const USER = require('../../models/user/user_model')
const VEHICLETYPE = require('../../models/admin/vehicle_type')
const TRIP = require('../../models/user/trip_model')
const multer = require('multer')
const path = require('path')
const constant = require('../../config/constant')
const mongoose = require('mongoose')
const randToken = require('rand-token').generator()

exports.add_trip = async (req, res) => {
    try {
        let data = req.body
        data.created_by = data.created_by ? data.created_by : req.userId
        data.trip_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        let check_user = await USER.findOne({ _id: req.userId })
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
        let ids = []
        for (let i of getIds) {
            ids.push(i._id)
        }
        const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
        console.log(mid, objectIds)

        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        {
                            $or: [
                                { created_by: { $in: objectIds } },
                                { status: true },
                                { created_by: mid },
                            ]
                        },
                        { trip_status: req.params.status },
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
                    status:1,
                    passenger_detail: 1,
                    vehicle_type: 1,
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

exports.get_trip_for_hotel = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.userId)

        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        { created_by: mid },
                        { trip_status: req.params.status },
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
                $project: {
                    _id: 1,
                    trip_from: 1,
                    trip_to: 1,
                    pickup_date_time: 1,
                    trip_status: 1,
                    createdAt: 1,
                    created_by: 1,
                    passenger_detail: 1,
                    vehicle_type: 1,
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
                    createdAt: 1,
                    trip_status: 1,
                    passenger_detail: 1,
                    'company_name': { $arrayElemAt: ["$userData.company_name", 0] },
                    vehicle_type: 1,
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
        console.log('check++++++++++++++', mid)
        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        // { created_by: mid },
                        { is_deleted: false }

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
                    createdAt: 1,
                    created_by: 1,
                    trip_status: 1,
                    'company_name': { $arrayElemAt: ["$userData.company_name", 0] },
                    passenger_detail: 1,
                    vehicle_type: 1,
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

exports.get_trip_by_company = async (req, res) => {
    try {
        let data = req.body
        let mid = new mongoose.Types.ObjectId(req.body.trip_id)
        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        // { created_by: mid },
                        { trip_status: req.params.status },
                        { is_deleted: false }
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
            let check_driver = await DRIVER.findOneAndUpdate({ _id: data.driver_name }, { is_available: false })
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
                    vehicle: data.vehicle,
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
        let mid = new mongoose.Types.ObjectId( req.params.id )
        let getData = await TRIP.aggregate([
            {
                $match:{
                    _id:mid
                }
            },
            {
                $lookup:{
                    from:"drivers",
                    localField:"driver_name",
                    foreignField:"_id",
                    as:"driver_info"
                }
            },
            {
                $unwind:"$driver_info"
            },
            {
                $lookup:{
                    from:"vehicles",
                    localField:"vehicle",
                    foreignField:"_id",
                    as:"vehicle_info"
                }
            },
            {
                $unwind:"$vehicle_info"
            },
        ])
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
                hotelName: getUser?getUser.company_name:"N/A"
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
        let bookedTrip = await TRIP.find({ trip_status: "Booked", is_deleted: false }).countDocuments();
        let cancelTrip = await TRIP.find({ trip_status: "Canceled", is_deleted: false }).countDocuments();
        let companyCount = await USER.find({ role: 'SUB_ADMIN', is_deleted: false }).countDocuments();
        res.send({
            code: constant.success_code,
            message: "success",
            result: {
                bookedTrips: bookedTrip,
                cancelTrips: cancelTrip,
                companies: companyCount
            }
        })
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}






