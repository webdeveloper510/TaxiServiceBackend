const FARE = require('../../models/user/fare_model')
// const VEHICLETYPE = require('../../models/user/trip_model')
const constant = require('../../config/constant')


exports.add_fare = async (req, res) => {
    try {
        let data = req.body
        let checkFare = await FARE.findOne({ vehicle_type: data.vehicle_type, created_by: req.userId,is_deleted:false })
        if (checkFare) {
            res.send({
                code: constant.error_code,
                message: res.__("addFare.error.fareAlreadyExistsForVehicleType")
            })
            return;
        }
        data.created_by = req.userId
        let save_data = await FARE(data).save()
        if(!save_data){
            res.send({
                code:constant.error_code,
                message: res.__("addFare.error.unableToAddFare")
            })
        }else{
            res.send({
                code:constant.success_code,
                message: res.__("addFare.success.fareAdded"),
                result:save_data
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_fares = async(req,res)=>{
    try{
        let data = req.body
        let getData = await FARE.find({created_by:req.userId,is_deleted:false}).sort({'createdAt':-1})
        if(!getData){
            res.send({
                code:constant.error_code,
                message: res.__("getFare.error.noDataFound")
            })
        }else{
            res.send({
                code:constant.success_code,
                message: res.__("getFare.success.fareRetrieved"),
                result:getData
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}

exports.get_fare_detail = async(req,res)=>{
    try{
        let data = req.body
        let getFareDetail = await FARE.findOne({_id:req.params.id})
        if(!getFareDetail){
            res.send({
                code:constant.error_code,
                message: res.__("getFare.error.noDataFound")
            })
        }else{
            res.send({
                code:constant.success_code,
                message: res.__("getFare.success.fareRetrieved"),
                resizeTo:getFareDetail
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}

exports.delete_fare = async(req,res)=>{
    try{
        let data = req.params
        let criteria = {_id:data.id}
        let newValue = {
            $set:{
                is_deleted:true
            }
        }
        let option = {new:true}
        let delete_fare = await FARE.findByIdAndUpdate(criteria,newValue,option)
        if(!delete_fare){
            res.send({
                code:constant.error_code,
                message: res.__("deleteFares.error.unableToDeleteFare")
            })
        }else{
            res.send({
                code:constant.success_code,
                message: res.__("deleteFares.success.fareDeleted")
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}

exports.edit_fare = async(req,res)=>{
    try{
        let data = req.body
        let criteria = {_id:req.params.id}
        let option = {new:true}
        let update_fare = await FARE.findByIdAndUpdate(criteria,data,option)
        if(!update_fare){
            res.send({
                code:constant.error_code,
                message: res.__("addFare.error.unableToAddFare")
            })
        }else{
            res.send({
                code:constant.success_code,
                message: res.__("addFare.success.fareUpdated"),
                result:update_fare
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}


