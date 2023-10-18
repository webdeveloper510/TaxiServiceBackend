const VEHICLE = require('../../models/user/vehicle_model')
const USER = require('../../models/user/user_model')
const VEHICLETYPE = require('../../models/admin/vehicle_type')
const TRIP = require('../../models/user/trip_model')
const multer = require('multer')
const path = require('path')
const constant = require('../../config/constant')


exports.add_trip = async(req,res)=>{
    try{
        let data = req.body
        
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}




