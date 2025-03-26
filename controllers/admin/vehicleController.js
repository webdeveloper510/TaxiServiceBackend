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
const { 
        terminateSubscriptionForBlockedDriver , 
        notifyUserAccountBlocked , 
        notifyUserAccountReactivated , 
        getUserCurrentActivePayedPlan , 
        transferTripToCompanyAccount} = require("../../Service/helperFuntion");
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
    storage: imageStorage,
    limits: { fileSize: 100 * 1024 * 1024 }
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

exports.adminAddVehicle = async (req, res) => {
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

            let data = req.body;
            const driverId = req.params.driverId;
            const driverInfo = await driver_model.findOne({_id: driverId});

            if (driverInfo) {
                let checkVehicle = await VEHICLE.findOne({ vehicle_number: data.vehicle_number })
                if (checkVehicle) {
                    res.send({
                        code: constant.error_code,
                        message: "Vehicle is already exist with this vehicle number"
                    })
                    return;
                }

                data.agency_user_id = driverId;
                data.created_by = req.userId;
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
            } else {
                res.send({
                    code: constant.error_code,
                    message: `Driver doen't exist`
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
                { agency_user_id: req.userId },
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
            return res.send({
                code: constant.error_code,
                message: "Wrong driver id",
                id: req.params.id
            })
        }
        let get_vehicle = await VEHICLE.find({
            $and: [
                { is_deleted: false },
                { agency_user_id: req.params.id },
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
           
            let check_vehicle = await VEHICLE.findOne({ _id: req.params.id })
            
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
                    message: "Updated successfully",
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
        if(req.user.defaultVehicle.toString() == req.params.id)
        {
            const driverInfo = await driver_model.findById(req.user._id);
            driverInfo.defaultVehicle = null;
            await driverInfo.save()
        }
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

exports.adminDeleteVehicle = async (req, res) => {
    
    try {
        let criteria = { _id: req.params.id };
        let newValue = {
            $set: {
                is_deleted: true
            }
        };

        
        let option = { new: true }
        let deleteOption = await VEHICLE.findOneAndUpdate(criteria, newValue, option)
        let driverInfo = await driver_model.findOne({ _id: deleteOption.agency_user_id });
        
        if(driverInfo && driverInfo?.defaultVehicle?.toString() == req.params.id)
        {
            let newValue = {
                $set: {
                    defaultVehicle: null
                }
            };

            let criteria = { _id: deleteOption.agency_user_id };
            await driver_model.findOneAndUpdate(criteria, newValue, option)   
        }

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
exports.blockUser = async (req, res) => {
    try {
        let data = req.body;
       
        const role = data?.role;
        const criteria = { _id: data._id };
        const updateData = { is_blocked: data?.is_blocked };

        if (data?.is_blocked == 'true') {

            if (role == constant.ROLES.DRIVER) { 
                updateData.is_available = false;
                updateData.status = false; // Driver will be show as offline
            }
            
            
            updateData.is_special_plan_active = false; // no Special plan given
            updateData.jwtTokenMobile = null; // Remove mobile token
            updateData.jwtToken = null; // Reove webtoken
            updateData.deviceToken = null; // Remove notification token    
        }

        const option = { new: true };
        let userInfo;

        if (role == constant.ROLES.COMPANY || role == constant.ROLES.HOTEL || role == constant.ROLES.ADMIN) {

            userInfo = await USER.findOneAndUpdate(criteria, updateData, option).lean();
        } else if (role == constant.ROLES.DRIVER) {

            userInfo = await driver_model.findOneAndUpdate(criteria, updateData, option).lean();

            if(data?.is_blocked == 'true') {
                transferTripToCompanyAccount(userInfo , req.io);
            }
        } else {
            return res.send({
                                code: constant.error_code,
                                message: `Role ${role} is not a valid enum value`
                            })
        }


        if (!userInfo) {

            return res.send({
                                code: constant.error_code,
                                message: "Unable to update the driver"
                            })
        } else {

            if (role == constant.ROLES.DRIVER) {
                userInfo.role = constant.ROLES.DRIVER;
            }
            
            let driverCurrentActivePlan;
            if (data?.is_blocked == 'true') {

                driverCurrentActivePlan = await getUserCurrentActivePayedPlan(userInfo);// getting current active plan for driver

                if (driverCurrentActivePlan) {
                   
                    terminateSubscriptionForBlockedDriver(userInfo); // terminate the susbcription and notify itvia email
                }

                notifyUserAccountBlocked(userInfo); // notify user via email regrarding block account

                // Logout from the app
                if (userInfo?.socketId) {
                    await req.io.to(userInfo?.socketId).emit("accountTerminated", { userDetail: userInfo } )
                }

               
                // logout from the web
                if (userInfo?.webSocketId) {
                    
                    await req.io.to(userInfo?.webSocketId).emit("accountTerminated", { userDetail: userInfo } )
                }
            } else {
                notifyUserAccountReactivated(userInfo); // notify the user that acount has been reactivated 
            }
           
            return res.send({
                                code: constant.success_code,
                                message: data?.is_blocked == 'true' ? `The ${userInfo.role.toLowerCase()} has been successfully blocked.` : `The ${userInfo.role.toLowerCase()} has been successfully unblocked.`,
                                
                            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.adminGetAllVehicle = async (req, res) => {
    try {
        const data = req.body;
        const search = data.search || "";
        const page = parseInt(data.page) || 1; // Current page number, default to 1
        const limit = parseInt(data.limit) || 10; // Number of items per page, default to 10
        const skip = (page - 1) * limit;

        const query = { is_deleted: false, };

        if (search.length > 0) {
            query.$or = [
                { vehicle_number: { $regex: search, $options: "i" } },
                { vehicle_type: { $regex: search, $options: "i" } },
                { vehicle_model: { $regex: search, $options: "i" } },
                { vehicle_make: { $regex: search, $options: "i" } },
                
            ];

            const  isNumber = (search) =>  typeof search === "number" && !isNaN(search); 
            console.log('isNumber(search)------' , isNumber(search))
            if (isNumber(search)) {
                query.$or.push({ seating_capacity: { $regex: Number(search), $options: "i" } })
            }
        }

        
        const totalCount = await VEHICLE.countDocuments(query);

        let get_vehicle = await VEHICLE.find(query).sort({ 'createdAt': -1 }).skip(skip).limit(limit).populate({
            path: "agency_user_id", // The field to populate
            select: "first_name last_name email phone" // Select fields from the users collection
        });
        if (!get_vehicle) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the details"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                totalCount: totalCount,
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

