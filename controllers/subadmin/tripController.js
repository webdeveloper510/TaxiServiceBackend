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

        if (req.params.status == 'Pending') {
            query = [
                { created_by: mid },
                {
                    $or: [
                        { trip_status: req.params.status },
                        { trip_status: "Accepted" }
                    ]
                }
            ]
        } else {
            query = [
                { created_by: mid },
                { trip_status: req.params.status }
            ]
        }

        console.log('aaaaaaaaaaaaaaaaaaa',query)

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
                    vehicle_type:1,
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




