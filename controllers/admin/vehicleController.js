const VEHICLE = require('../../models/user/vehicle_model')
const USER = require('../../models/user/user_model')
const VEHICLETYPE = require('../../models/admin/vehicle_type')
const multer = require('multer')
const path = require('path')
const constant = require('../../config/constant')


var vehicleStorage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../../uploads/vehicle'))
    },
    filename: function (req, file, cb) {
        console.log("file+++++++++++++++++++++++=", file)
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
    }
})

var vehicleUpload = multer({
    storage: vehicleStorage
}).single("vehicle_photo")


exports.get_vehicle_types = async (req, res) => {
    try {
        let get_data = await VEHICLETYPE.find({}, { name: 1 }).sort({ 'name': 1 })
        if (!get_data) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the data"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: get_data
            })
        }
    } catch (err) {
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
                    message: "Vehicle is already exist with this vehicle number"
                })
                return;
            }
            data.agency_user_id = req.userId
            data.vehicle_photo = req.file.filename
            let save_data = await VEHICLE(data).save()
            if (!save_data) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to create the vehicle"
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: "Created Successfully",
                    result: save_data
                })
            }
        } catch (err) {
            res.send({
                code: constant.error_code,
                message: err.message
            })
        }
    })

}

// exports.get_vehicles = async(req,res)=>{
//     try{
//         let get_vehicle = await
//     }catch(err){
//         res.send({
//             code:constant.error_code,
//             message:err.message
//         })
//     }
// }

