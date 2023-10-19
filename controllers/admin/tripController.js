const VEHICLE = require('../../models/user/vehicle_model')
const USER = require('../../models/user/user_model')
const VEHICLETYPE = require('../../models/admin/vehicle_type')
const TRIP = require('../../models/user/trip_model')
const multer = require('multer')
const path = require('path')
const constant = require('../../config/constant')
const mongoose = require('mongoose')


exports.add_trip = async(req,res)=>{
    try{
        let data = req.body
        data.created_by = req.userId
        let add_trip = await TRIP(data).save()
        if(!add_trip){
            res.send({
                code:constant.error_code,
                message:"Unable to create the trip"
            })
        }else{
            res.send({
                code:constant.success_code,
                message:"Saved Successfully",
                result:add_trip
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}

exports.get_trip = async(req,res)=>{
    try{
        let data = req.body
        let mid =new  mongoose.Types.ObjectId(req.userId)
        console.log('mid--------------',req.params.status)
        let get_trip = await TRIP.aggregate([
            {
                $match:{
                    $and:[
                        {created_by:mid},
                        {trip_status:req.params.status}
                    ]
                }
            },
            {
                $lookup:{
                    from:'drivers',
                    localField:'driver_name',
                    foreignField:'_id',
                    as:'driver',
                }
            },
            {
                $lookup:{
                    from:'vehicles',
                    localField:'vehicle',
                    foreignField:'_id',
                    as:'vehicle',
                }
            },
            {
                $project:{
                    _id:1,
                    trip_from:1,
                    trip_to:1,
                    pickup_date_time:1,
                    trip_status:1,
                    passenger_detail:1,
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
                }
            }
        ]).sort({'createdAt':-1})
        if(!get_trip){
            res.send({
                code:constant.error_code,
                message:"Unable to get the trips"
            })
        }else{
            res.send({
                code:constant.success_code,
                message:"Success",
                result:get_trip
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}




