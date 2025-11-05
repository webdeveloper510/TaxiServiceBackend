const VEHICLE = require('../../models/user/vehicle_model')
const USER = require('../../models/user/user_model')
const VEHICLETYPE = require('../../models/admin/vehicle_type')
const multer = require('multer')
const path = require('path')
const constant = require('../../config/constant')



const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../../config/cloudinary");
const imageStorage = require('../../config/awss3')

// const imageStorage = new CloudinaryStorage({
//     cloudinary: cloudinary,
//     params: {
//         folder: "TaxiBooking",
//         // allowedFormats: ["jpg", "jpeg", "png"],
//         public_id: (req, file) =>
//         `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
//         // format: async (req, file) => "jpg", // Convert all uploaded images to JPEG format
//         // transformation: [{ width: 500, height: 500, crop: "limit" }],
//         maxFileSize: 10000000,
//     },
// });

var vehicleUpload = multer({
    storage: imageStorage,
    limits: { fileSize: 100 * 1024 * 1024 }
}).single("vehicle_photo")

exports.get_vehicle_types = async (req, res) => {
    try {
        let get_data = await VEHICLETYPE.find({}, { name: 1 }).sort({ 'name': 1 })
        if (!get_data) {
            res.send({
                code: constant.error_code,
                message: res.__("getVehicle.error.noVehicleFound")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleListRetrieved"),
                result: get_data
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get vehicle types:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.add_vehicle = async (req, res) => {
    vehicleUpload(req, res, async (err) => {
        try {
            let data = req.body
            let checkVehicle = await VEHICLE.findOne({ vehicle_number: data.vehicle_number })
            if (checkVehicle) {
                res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.vehicleNumberAlreadyInUse")
                })
                return;
            }
            data.agency_user_id = req.userId
            data.vehicle_photo = req.file ? req.file.path : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg"
            let save_data = await VEHICLE(data).save()
            if (!save_data) {
                res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.unableToAddVehicle")
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: res.__("getVehicle.success.vehicleAdded"),
                    result: save_data
                })
            }
        } catch (err) {

            console.log('❌❌❌❌❌❌❌❌❌Error add vehicle:', err.message);
            res.send({
                code: constant.error_code,
                message: err.message
            })
        }
    })

}

exports.get_vehicles = async (req, res) => {
    try {
        let get_vehicle = await VEHICLE.find({ agency_user_id: req.userId }).sort({ 'createdAt': -1 })
        if (!get_vehicle) {
            res.send({
                code: constant.error_code,
                message: res.__("getVehicle.error.noVehicleFound")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleListRetrieved"),
                result: get_vehicle
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get vehicles:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_vehicle_detail = async (req, res) => {
    try {
        let getData = await VEHICLE.findOne({ _id: req.params.id })
        if (!getData) {
            res.send({
                code: constant.error_code,
                message: res.__("getVehicle.error.noVehicleFound")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleListRetrieved"),
                result: getData
            }) 
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get vehicle details:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.edit_vehicle = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: req.params.id }
        let option = { new: true }
        let check_vehicle = await VEHICLE(criteria)
        if (!check_vehicle) {
            res.send({
                code: constant.error_code,
                message: res.__("getVehicle.error.invalidVehicle")
            })
            return;
        }
        let updateVehicle = await VEHICLE.findOneAndUpdate(criteria, data, option)
        if (!updateVehicle) {
            res.send({
                code: constant.error_code,
                message: res.__("getVehicle.error.updateFailed")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleUpdated"),
                result: updateVehicle
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error edit vehicle:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.delete_vehicle = async(req,res)=>{
    try{
        let criteria = {_id:req.params.id};
        let newValue = {
            $set:{
                is_deleted:true
            }
        };
        let option = {new:true}
        let deleteOption = await VEHICLE.findOneAndUpdate(criteria,newValue,option)
        if(!deleteOption){
            res.send({
                code:constant.error_code,
                message: res.__("getVehicle.error.deleteFailed"),
            })
        }else{
            res.send({
                code:constant.success_code,
                message: res.__("getVehicle.success.vehicleDeleted"),
            })
        }
    }catch(err){

        console.log('❌❌❌❌❌❌❌❌❌Error delete vehicle:', err.message);
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}

