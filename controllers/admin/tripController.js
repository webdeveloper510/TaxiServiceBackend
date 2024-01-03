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
            data.price = fare_per_km * Number(distance)
        }
        console.log('check===========================', data)
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
        console.log('check===========================', data)
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
        const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
        console.log(mid, objectIds)
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
        console.log('check++++++++++++++', mid)
        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        // { created_by: mid },
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
                $project: {
                    'phone': { $arrayElemAt: ["$hotel_info.phone", 0] },
                    'email': { $arrayElemAt: ["$hotel_info.email", 0] },
                    'vehicle': { $arrayElemAt: ["$vehicle_info.vehicle_model", 0] },
                    'driverInfo': { $arrayElemAt: ["$driver_info", 0] },
                    'driver_name': {
                        $concat: [
                            { $arrayElemAt: ["$driver_info.first_name", 0] },
                            ' ',
                            { $arrayElemAt: ["$driver_info.last_name", 0] }
                        ]
                    },
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
        // console.log('data=========',getData[0].price,fare_per_km*Number(distance))


        // return

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















