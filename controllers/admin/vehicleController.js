const VEHICLE = require('../../models/user/vehicle_model')
const USER = require('../../models/user/user_model')
const VEHICLETYPE = require('../../config/vehicleType')
const multer = require('multer')
const path = require('path')
const constant = require('../../config/constant')

const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../../config/cloudinary");
const driver_model = require('../../models/user/driver_model')
const imageStorage = require('../../config/awss3')

// const imageStorage = new CloudinaryStorage({
//     cloudinary: cloudinary,
//     params: {
//         folder: "TaxiBooking",
//         public_id: (req, files) =>
//             `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
//         maxFileSize: 10000000,
//     },
// });

var vehicleUpload = multer({
    storage: imageStorage
}).any([
    { name: "vehicle_photo" },
    { name: "vehicle_documents" }
])

exports.get_vehicle_types = async (req, res) => {
    try {
        // let get_data = await VEHICLETYPE.find({}, { name: 1 }).sort({ 'name': 1 })

        res.send({
            code: constant.success_code,
            message: "Success",
            result: VEHICLETYPE
        })

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
            var vehicle_documents = [];
            var vehicle_photo = [];

            // var imagePortfolioLogo = []
            let file = req.files
            for (i = 0; i < file.length; i++) {
                if (file[i].fieldname == 'vehicle_photo') {
                    vehicle_photo.push(file[i].location);
                } else if (file[i].fieldname == 'vehicle_documents') {
                    vehicle_documents.push(file[i].location);

                }
            }

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
            data.created_by = req.userId
            data.vehicle_photo = vehicle_photo.length != 0 ? vehicle_photo[0] : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg"
            data.vehicle_documents = vehicle_documents.length != 0 ? vehicle_documents[0] : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg"
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

exports.get_vehicles = async (req, res) => {
    try {
        let getUser = await USER.findOne({ _id: req.userId })
        let get_vehicle = await VEHICLE.find({
            $and: [
                { is_deleted: false },
                { created_by: req.userId },
                // {
                //     $or: [
                //         { created_by: req.userId },
                //         { created_by: getUser.created_by },
                //     ]
                // }
            ]
        }).sort({ 'createdAt': -1 })
        if (!get_vehicle) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the details"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: get_vehicle
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}
exports.get_vehicles_by_driverid = async (req, res) => {
    try {
        const driverData = await driver_model.findOne({_id:req.params.id});
        if(!driverData){
            res.send({
                code: constant.error_code,
                message: "Wrong driver id"
            })
        }
        let get_vehicle = await VEHICLE.find({
            $and: [
                { is_deleted: false },
                { created_by: req.params.id },
                // {
                //     $or: [
                //         { created_by: req.userId },
                //         { created_by: getUser.created_by },
                //     ]
                // }
            ]
        }).sort({ 'createdAt': -1 })
        if (!get_vehicle) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the details"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: get_vehicle,
                defaulVehicle: driverData.defaultVehicle
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_vehicles_with_type = async (req, res) => {
    try {
        let getUser = await USER.findOne({ _id: req.userId })
        let get_vehicle = await VEHICLE.find({
            $and: [
                { is_deleted: false },
                { 'vehicle_type': { '$regex': req.params.vehicle_type, '$options': 'i' } },
                { created_by: req.userId },

                // {
                //     $or: [
                //         { created_by: req.userId },
                //         { created_by: getUser.created_by },
                //     ]
                // }
            ]
        }).sort({ 'createdAt': -1 })
        if (!get_vehicle) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the details"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: get_vehicle
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_vehicle_type = async (req, res) => {
    try {
        let data = req.body
        let getData = await VEHICLE.find({ vehicle_type: req.params.vehicle_type })
        console.log("🚀 ~ exports.get_vehicle_type= ~ getData:", getData)
        if (!getData) {
            res.send({
                code: constant.error_code,
                message: "Unbale to fetch the vehicles"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: getData
            })
        }
    } catch (err) {
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
                message: "Unable to fetch the details"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: getData
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.edit_vehicle = async (req, res) => {
    vehicleUpload(req, res, async (err) => {
        try {
            let data = req.body
            var vehicle_documents = [];
            var vehicle_photo = [];

            // var imagePortfolioLogo = []
            let file = req.files
            for (i = 0; i < file.length; i++) {
                if (file[i].fieldname == 'vehicle_photo') {
                    vehicle_photo.push(file[i].location);
                } else if (file[i].fieldname == 'vehicle_documents') {
                    vehicle_documents.push(file[i].location);

                }
            }
            let criteria = { _id: req.params.id }
            let option = { new: true }
            console.log('dafdasf')
            let check_vehicle = await VEHICLE.findOne({ _id: req.params.id })
            console.log('dafdasf')
            if (!check_vehicle) {
                res.send({
                    code: constant.error_code,
                    message: "Invalid ID"
                })
                return;
            }
            data.vehicle_photo = vehicle_photo.length != 0 ? vehicle_photo[0] : check_vehicle.vehicle_photo
            data.vehicle_documents = vehicle_documents.length != 0 ? vehicle_documents[0] : check_vehicle.vehicle_documents

            let updateVehicle = await VEHICLE.findOneAndUpdate(criteria, data, option)
            if (!updateVehicle) {
                res.send({
                    code: constant.error_code,
                    message: "Unable to update the details"
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: "Updated Successfully",
                    result: updateVehicle
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

exports.delete_vehicle = async (req, res) => {
    try {
        let criteria = { _id: req.params.id };
        let newValue = {
            $set: {
                is_deleted: true
            }
        };
        let option = { new: true }
        let deleteOption = await VEHICLE.findOneAndUpdate(criteria, newValue, option)
        if (!deleteOption) {
            res.send({
                code: constant.error_code,
                message: "Unable to Delete Vehicle"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Deleted"
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

