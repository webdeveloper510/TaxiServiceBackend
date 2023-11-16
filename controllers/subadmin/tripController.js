const VEHICLE = require('../../models/user/vehicle_model')
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
        data.created_by = req.userId
        data.trip_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        let check_user = await USER.findOne({ _id: req.userId })
        data.trip_id = check_user.first_name + '-' + data.trip_id
        // check_vehicle = await VEHICLE.findOne({ _id: data.vehicle })
        // if (!check_vehicle) {
        //     res.send({
        //         code: constant.error_code,
        //         message: "Invalid Vehicle"
        //     })
        //     return;
        // }
        // check_vehicle = await DRIVER.findOne({ _id: data.driver_name })
        // if (!check_vehicle) {
        //     res.send({
        //         code: constant.error_code,
        //         message: "Invalid Driver"
        //     })
        //     return;
        // }
        // check_vehicle = await TRIP.findOne({ trip_id: data.vehicle })
        // if (!check_vehicle) {
        //     res.send({
        //         code: constant.error_code,
        //         message: "Invalid Driver"
        //     })
        //     return;
        // }
        // console.log(check_vehicle)
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
        let query;
        let search_value = data.comment ? data.comment : ''
       


        if (req.params.status == 'Pending') {
            query = [
                { created_by: mid },
                {
                    $or: [
                        { trip_status: req.params.status },
                        { trip_status: "Accepted" },
                        { status: true }
                    ]
                },
                { is_deleted: false },
                { 'comment': { '$regex': search_value, '$options': 'i' } },

            ]
        } else {
            query = [
                { created_by: mid },
                { trip_status: req.params.status },
                { 'comment': { '$regex': search_value, '$options': 'i' } },

            ]
        }

        console.log('aaaaaaaaaaaaaaaaaaa', query)

        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: query
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
                    commission:1,
                    comment:1,
                    pay_option:1,
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
        console.log('check++++++++++++++', mid)
        let get_trip = await TRIP.aggregate([
            {
                $match: {
                    $and: [
                        { created_by: mid },
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
                    pickup_date_time: 1,
                    createdAt: 1,
                    created_by: 1,
                    trip_status: 1,
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

exports.get_counts_dashboard = async (req, res) => {
    try {
        let data = req.body
        let bookedTrip = await TRIP.find({
            $and: [
                { trip_status: "Booked" },
                { is_deleted: false },
                { created_by: req.userId }
            ]
        }).countDocuments();
        let cancelTrip = await TRIP.find({
            $and: [
                { trip_status: "Cenceled" },
                { is_deleted: false },
                { created_by: req.userId }
            ]
        }).countDocuments();
        let completeTrip = await TRIP.find({
            $and: [
                { trip_status: "Completed" },
                { is_deleted: false },
                { created_by: req.userId }
            ]
        }).countDocuments();
        res.send({
            code: constant.success_code,
            message: "success",
            result: {
                bookedTrips: bookedTrip,
                cancelTrips: cancelTrip,
                completeTrips: completeTrip,
            }
        })
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.edit_trip = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: req.params.id }
        let option = { new: true }
        data.status = true
        let update_trip = await TRIP.findOneAndUpdate(criteria, data, option)
        if (!update_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to update the trip"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Updated Successfully",
                result: update_trip
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.delete_trip = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: req.params.id }
        let option = { new: true }
        let newValue = {
            $set: {
                is_deleted: true
            }
        }
        let update_trip = await TRIP.findOneAndUpdate(criteria, newValue, option)
        if (!update_trip) {
            res.send({
                code: constant.error_code,
                message: "Unable to delete the trip"
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
}
