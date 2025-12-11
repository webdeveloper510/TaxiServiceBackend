const VEHICLE = require('../../models/user/vehicle_model')
const USER = require('../../models/user/user_model')
const CAR_TYPE = require('../../models/admin/car_type_model')
const VEHICLETYPE = require('../../config/vehicleType')
const VEHICLE_UPDATE_REQUEST_MODEL = require('../../models/user/vehicle_update_requests_model')
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
const { updateDriverMapCache , removeDriverForSubscribedClients , broadcastDriverLocation} = require("../../Service/location.service");
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
            message: res.__("getVehicle.success.getVehicleType"),
            result: VEHICLETYPE
        })

    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get vehicle types:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.addCarType  = async (req, res) => {
    try {
        
        const name = req.body.name.trim().toLowerCase();
        let checkVehicle = await CAR_TYPE.findOne({ name: new RegExp(`^${name}$`, 'i') })
        if (checkVehicle) {
            res.send({
                code: constant.error_code,
                message: res.__("getVehicle.error.vehicleNameAlreadyInUse")
            })
            return;
        }

        const data = { name: name,}

        let save_data = await CAR_TYPE(data).save()
        res.send({
            code: constant.success_code,
            message: res.__("getVehicle.success.carTypeAdded"),
            result: save_data
        })
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error add car type:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.getCarTypeList = async (req, res) => {
    try {

        let carTypeList = await CAR_TYPE.find({ is_deleted: false });
         res.send({
            code: constant.success_code,
            result: carTypeList
        })
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get car type list:', err.message);
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
            var registration_doc_front = '';
            var registration_doc_back = '';
            // var imagePortfolioLogo = []
            let file = req.files
            for (i = 0; i < file.length; i++) {
                if (file[i].fieldname == 'vehicle_photo') {
                    vehicle_photo.push(file[i].location);
                } else if (file[i].fieldname == 'vehicle_documents') {
                    vehicle_documents.push(file[i].location);

                } else if (file[i].fieldname == 'registration_doc_front') {

                    registration_doc_front = file[i].location;
                } else if (file[i].fieldname == 'registration_doc_back') {
                    registration_doc_back = file[i].location;
                }
            }

            const missingField = (!vehicle_photo || vehicle_photo.length === 0)
                                    ? "getVehicle.error.uploadVehiclePhotoRequired"
                                    : (!registration_doc_front)
                                    ? "getVehicle.error.uploadVehicleDocumentFrontRequired"
                                    : (!registration_doc_back)
                                        ? "getVehicle.error.uploadVehicleDocumentBackRequired"
                                        : null;

            if (missingField) {
                return res.send({
                                    code: constant.error_code,
                                    message: res.__(missingField)
                                });
            }
            

            let data = req.body
            let checkVehicle = await VEHICLE.findOne({ vehicle_number: new RegExp(`^${data.vehicle_number}$`, "i") })
            if (checkVehicle) {
                return res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.vehicleNumberAlreadyInUse")
                })
                
            }

            const vehicle_data   =   {
                                    vehicle_number: data.vehicle_number,
                                    vehicle_type: data.vehicle_type,
                                    vehicle_model: data.vehicle_model,
                                    vehicle_make: data.vehicle_make,
                                    vehicle_make_year: data.vehicle_make_year,
                                    AC: data.AC == "true" ? true : false,
                                    seating_capacity: data.seating_capacity,
                                    insurance_renewal_date: data.insurance_renewal_date,
                                    vehicle_photo: vehicle_photo.length != 0 ? vehicle_photo[0] : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg",
                                    registration_doc_front: registration_doc_front,
                                    registration_doc_back: registration_doc_back,
                                    insurance_doc_front: "",
                                    insurance_doc_back: "",   
                                };

            let vehicle = await VEHICLE.create({
                                                    agency_user_id: req.userId,
                                                    verification_status: constant.VEHICLE_UPDATE_STATUS.PENDING,
                                                    created_by: req.userId,
                                                    last_admin_status : constant.VEHICLE_UPDATE_STATUS.PENDING,
                                                    last_admin_comment : "",
                                                    ...vehicle_data
                                                });

            const request = await VEHICLE_UPDATE_REQUEST_MODEL.create({
                                                                            vehicle_id: vehicle._id, // important for first time
                                                                            driver_id: req.userId,
                                                                            action: constant.VEHICLE_UPDATE_ACTION.CREATE,
                                                                            requested_data: vehicle_data,
                                                                            current_data: {}, // nothing to compare
                                                                        });
                                                                        
            vehicle.pending_request_id = request._id;
            await vehicle.save();
            // data.agency_user_id = req.userId
            // data.created_by = req.userId
            // data.vehicle_photo = vehicle_photo.length != 0 ? vehicle_photo[0] : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg"
            // data.vehicle_documents = vehicle_documents.length != 0 ? vehicle_documents[0] : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg"
            // let save_data = await VEHICLE(data).save()


            if (!request) {
                res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.unableToAddVehicle")
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: res.__("getVehicle.success.vehicle_submitted_for_approval"),
                    // result: request
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

exports.adminAddVehicle = async (req, res) => {
    vehicleUpload(req, res, async (err) => {
        try {
            var vehicle_documents = [];
            var vehicle_photo = [];
            var registration_doc_front = '';
            var registration_doc_back = '';

            // var imagePortfolioLogo = []
            let file = req.files
            for (let i = 0; i < file.length; i++) {
                if (file[i].fieldname == 'vehicle_photo') {
                    vehicle_photo.push(file[i].location);
                } else if (file[i].fieldname == 'vehicle_documents') {
                    vehicle_documents.push(file[i].location);

                } else if (file[i].fieldname == 'registration_doc_front') {

                    registration_doc_front = file[i].location;
                } else if (file[i].fieldname == 'registration_doc_back') {
                    registration_doc_back = file[i].location;
                }
            }

            const missingField = (!vehicle_photo || vehicle_photo.length === 0)
                                    ? "getVehicle.error.uploadVehiclePhotoRequired"
                                    : (!registration_doc_front)
                                    ? "getVehicle.error.uploadVehicleDocumentFrontRequired"
                                    : (!registration_doc_back)
                                        ? "getVehicle.error.uploadVehicleDocumentBackRequired"
                                        : null;

            if (missingField) {
                return res.send({
                                    code: constant.error_code,
                                    message: res.__(missingField)
                                });
            }

            let data = req.body;
            const driverId = req.params.driverId;
            const driverInfo = await driver_model.findOne({_id: driverId});

            if (!driverInfo) {
                return res.send({
                                    code: constant.error_code,
                                    message: res.__("getDrivers.error.noDriverFound")
                                })
            }
            
           let checkVehicle = await VEHICLE.findOne({ vehicle_number: new RegExp(`^${data.vehicle_number}$`, "i") });

            if (checkVehicle) {
                return res.send({
                                    code: constant.error_code,
                                    message: res.__("getVehicle.error.vehicleNumberAlreadyInUse")
                                });
            }

            const requested_data   =   {
                                        vehicle_number: data.vehicle_number,
                                        vehicle_type: data.vehicle_type,
                                        vehicle_model: data.vehicle_model,
                                        vehicle_make: data.vehicle_make,
                                        AC: data.AC == "true" ? true : false,
                                        seating_capacity: data.seating_capacity,
                                        insurance_renewal_date: data.insurance_renewal_date,
                                        vehicle_photo: vehicle_photo.length != 0 ? vehicle_photo[0] : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg",
                                        registration_doc_front: registration_doc_front,
                                        registration_doc_back: registration_doc_back,
                                        insurance_doc_front: "",
                                        insurance_doc_back: "",
                                    };

            let vehicle = await VEHICLE.create({
                                                agency_user_id: driverId,
                                                verification_status: constant.VEHICLE_UPDATE_STATUS.APPROVED,
                                                created_by: req.userId,
                                                last_admin_status : constant.VEHICLE_UPDATE_STATUS.APPROVED,
                                                last_admin_comment : "",
                                                ever_approved: true,
                                                last_verified_at: new Date(),
                                                ...requested_data
                                            });

            const request = await VEHICLE_UPDATE_REQUEST_MODEL.create({
                                                                        vehicle_id: vehicle._id, // important for first time
                                                                        driver_id: driverId,
                                                                        action: constant.VEHICLE_UPDATE_ACTION.CREATE,
                                                                        status: constant.VEHICLE_UPDATE_STATUS.APPROVED,
                                                                        requested_data: requested_data,
                                                                        current_data: {}, // nothing to compare
                                                                        reviewed_by: req.userId,
                                                                        reviewed_at: new Date()
                                                                    });

            // data.agency_user_id = driverId;
            // data.created_by = req.userId;
            // data.vehicle_photo = vehicle_photo.length != 0 ? vehicle_photo[0] : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg"
            // data.vehicle_documents = vehicle_documents.length != 0 ? vehicle_documents[0] : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718367/samples/wzvmzalzhjuve5bydabm.jpg"
        

            
            if (!vehicle) {
                res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.unableToAddVehicle")
                })
            } else {
                res.send({
                    code: constant.success_code,
                    message: res.__("getVehicle.success.vehicleAdded"),
                })
            }
            
            
        } catch (err) {

            console.log('❌❌❌❌❌❌❌❌❌Error admin add vehicle:', err.message);
            res.send({
                code: constant.error_code,
                message: err.message
            })
        }
    })

}

exports.get_vehicles = async (req, res) => {
    try {
        // let getUser = await USER.findOne({ _id: req.userId })
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

        console.log('❌❌❌❌❌❌❌❌❌Error get vehicle:', err.message);
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
                message: res.__("getDrivers.error.noDriverFound"),
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
                message: res.__("getVehicle.error.invalidVehicleType")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleListRetrieved"),
                result: get_vehicle,
                defaulVehicle: driverData.defaultVehicle
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get vehicles by driver id:', err.message);
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
                message:res.__("getVehicle.error.noVehicleFound")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleListRetrieved"),
                result: get_vehicle
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get vehicles with type:', err.message);
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

        console.log('❌❌❌❌❌❌❌❌❌Error get vehocle type:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_vehicle_detail = async (req, res) => {
    try {
        let getData = await VEHICLE.findOne({ _id: req.params.id }).populate("pending_request_id")
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
    vehicleUpload(req, res, async (err) => {
        try {
            let data = req.body;
            const vehicleId = req.params.id;
            var vehicle_documents = [];
            var vehicle_photo = [];
            var registration_doc_front = '';
            var registration_doc_back = '';
            // var imagePortfolioLogo = []
            let file = req.files
            console.log("file.length---" , file.length)
            for (i = 0; i < file.length; i++) {
                if (file[i].fieldname == 'vehicle_photo') {
                    vehicle_photo.push(file[i].location);
                } else if (file[i].fieldname == 'vehicle_documents') {
                    vehicle_documents.push(file[i].location);

                } else if (file[i].fieldname == 'registration_doc_front') {

                    registration_doc_front = file[i].location;
                } else if (file[i].fieldname == 'registration_doc_back') {
                    registration_doc_back = file[i].location;
                }
            }

            

            let vehicle;
            
            if (req.user?.role === constant.ROLES.ADMIN || req.user?.role === constant.ROLES.SUPER_ADMIN) {

                vehicle = await VEHICLE.findOne({ _id: vehicleId , is_deleted: false})
            } else {
                vehicle = await VEHICLE.findOne({ _id: vehicleId , agency_user_id: req.userId , is_deleted: false})
            }

            if (!vehicle) {
                return res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.invalidVehicleType")
                })
            }

            let missingField = null;

            if (req.user?.role === constant.ROLES.ADMIN || req.user?.role === constant.ROLES.SUPER_ADMIN) {

                missingField = !vehicle?.vehicle_photo 
                                    ? "getVehicle.error.uploadVehiclePhotoRequired"
                                    : (!vehicle?.registration_doc_front)
                                    ? "getVehicle.error.uploadVehicleDocumentFrontRequired"
                                    : (!vehicle?.registration_doc_back)
                                        ? "getVehicle.error.uploadVehicleDocumentBackRequired"
                                        : null;
            } else {

                missingField = (!vehicle_photo || vehicle_photo.length === 0)
                                    ? "getVehicle.error.uploadVehiclePhotoRequired"
                                    : (!registration_doc_front)
                                    ? "getVehicle.error.uploadVehicleDocumentFrontRequired"
                                    : (!registration_doc_back)
                                        ? "getVehicle.error.uploadVehicleDocumentBackRequired"
                                        : null;
            }

            if (missingField) {
                return res.send({
                                    code: constant.error_code,
                                    message: res.__(missingField)
                                });
            }
            
            

            // check if vehicle number exist or not with another vehicle
            let checkVehicle = await VEHICLE.findOne({ _id: { $ne: vehicleId } ,vehicle_number: new RegExp(`^${data.vehicle_number}$`, "i") })
            if (checkVehicle) {
                return res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.vehicleNumberAlreadyInUse")
                });
            }

            if (vehicle.verification_status !== constant.VEHICLE_UPDATE_STATUS.APPROVED && vehicle.has_pending_update == true) {
                return res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.onlyAfterApproval"),
                });
            }

            if (vehicle.pending_request_id) {
                return res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.pendingCannotUpdate")
                });
            }

            const current_data   =   {
                                    vehicle_number: vehicle.vehicle_number,
                                    vehicle_type: vehicle.vehicle_type,
                                    vehicle_model: vehicle.vehicle_model,
                                    vehicle_make: vehicle.vehicle_make,
                                    vehicle_make_year: vehicle.vehicle_make_year,
                                    AC: vehicle.AC ,
                                    seating_capacity: vehicle.seating_capacity,
                                    insurance_renewal_date: vehicle.insurance_renewal_date,
                                    vehicle_photo: vehicle.vehicle_photo,
                                    registration_doc_front: vehicle.registration_doc_front,
                                    registration_doc_back: vehicle.registration_doc_back,
                                    insurance_doc_front: vehicle.insurance_doc_front,
                                    insurance_doc_back: vehicle.insurance_doc_back,   
                                };

            const requested_data    =   {
                                            vehicle_number: data.vehicle_number,
                                            vehicle_type: data.vehicle_type,
                                            vehicle_model: data.vehicle_model,
                                            vehicle_make: data.vehicle_make,
                                            vehicle_make_year: data.vehicle_make_year,
                                            AC: data.AC == "true" ? true : false,
                                            seating_capacity: data.seating_capacity,
                                            insurance_renewal_date: data.insurance_renewal_date,
                                            vehicle_photo: vehicle_photo.length != 0 ? vehicle_photo[0] : vehicle.vehicle_photo,
                                            registration_doc_front: registration_doc_front ? registration_doc_front : vehicle.registration_doc_front,
                                            registration_doc_back: registration_doc_back ? registration_doc_back : vehicle.registration_doc_back,
                                            insurance_doc_front: "",
                                            insurance_doc_back: "",   
                                        };

            const request = await VEHICLE_UPDATE_REQUEST_MODEL.create({
                                                                        vehicle_id: vehicle._id, 
                                                                        driver_id: vehicle.agency_user_id,
                                                                        action: constant.VEHICLE_UPDATE_ACTION.UPDATE,
                                                                        requested_data: requested_data,
                                                                        current_data: current_data, 
                                                                        status: req.user?.role === constant.ROLES.ADMIN || req.user?.role === constant.ROLES.SUPER_ADMIN ? constant.VEHICLE_UPDATE_STATUS.APPROVED : constant.VEHICLE_UPDATE_STATUS.PENDING,
                                                                        reviewed_by: req.user?.role === constant.ROLES.ADMIN || req.user?.role === constant.ROLES.SUPER_ADMIN ? req.userId : null,
                                                                        reviewed_at: req.user?.role === constant.ROLES.ADMIN || req.user?.role === constant.ROLES.SUPER_ADMIN ? new Date() : null
                                                                    });

            // when admin or super admin will edit the vehicle then it will be directly approved. 
            if (req.user?.role === constant.ROLES.ADMIN || req.user?.role === constant.ROLES.SUPER_ADMIN) {

                Object.assign(vehicle, requested_data);
                vehicle.has_pending_update = false;
                vehicle.pending_request_id = null;
                vehicle.ever_approved    =  true;
                // last admin decision is now "pending" again
                vehicle.last_admin_status = constant.VEHICLE_UPDATE_STATUS.APPROVED;
                vehicle.last_admin_comment = '';
                vehicle.last_verified_at = new Date();
                await vehicle.save();

                updateDriverMapCache(vehicle.agency_user_id);

                const vehicleInfo = await VEHICLE.find({agency_user_id: vehicle.agency_user_id , verification_status :  constant.VEHICLE_UPDATE_STATUS.APPROVED , is_deleted: false  , pending_request_id: null})
            
                // If driver have only one vehicle as Approved then it will be default vehicle for the driver
                if (vehicleInfo.length == 1) {

                    await driver_model.findOneAndUpdate({_id: vehicleInfo?.agency_user_id} , { defaultVehicle: vehicleId });
                    updateDriverMapCache(vehicleInfo?.agency_user_id);
                }
            } else {

                vehicle.has_pending_update = true;
                vehicle.pending_request_id = request._id;

                // last admin decision is now "pending" again
                vehicle.last_admin_status = constant.VEHICLE_UPDATE_STATUS.PENDING;
                vehicle.last_admin_comment = '';
                await vehicle.save();
            }

            
            // data.vehicle_photo = vehicle_photo.length != 0 ? vehicle_photo[0] : vehicle.vehicle_photo
            // data.vehicle_documents = vehicle_documents.length != 0 ? vehicle_documents[0] : vehicle.vehicle_documents

            // let updateVehicle = await VEHICLE.findOneAndUpdate(criteria, data, option)
            if (!request) {
                return res.send({
                    code: constant.error_code,
                    message: res.__("getVehicle.error.updateFailed")
                })
            } else {
                return res.send({
                    code: constant.success_code,
                    message:  res.__("getVehicle.success.vehicleUpdationRequestSubmitted"),
                })
            }
        } catch (err) {

            console.log('❌❌❌❌❌❌❌❌❌Error edit vehicle:', err.message);
            return res.send({
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
        if(req.user?.defaultVehicle?.toString() == req.params.id)
        {
            const driverInfo = await driver_model.findById(req.user._id);
            driverInfo.defaultVehicle = null;
            await driverInfo.save();
            const driverId = driverInfo._id;
            updateDriverMapCache(driverId);   // update driver profile cache
            removeDriverForSubscribedClients(driverInfo , req.io)
        }
        if (!deleteOption) {
            res.send({
                code: constant.error_code,
                message: res.__("getVehicle.error.deleteFailed")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleDeleted")
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error delete vehicle:', err.message);
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
                message: res.__("getVehicle.error.deleteFailed")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleDeleted")
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error admin delete vehicle:', err.message);
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

            const driverInfo = await driver_model.findOne(criteria);

            // If driver is on trip then admin can't block the driver
            if (driverInfo?.currentTripId !== null) {
                return res.send({
                                code: constant.error_code,
                                message: res.__("getDrivers.error.cannotBlockDriverDuringActiveTrip")
                            })
            }
            userInfo = await driver_model.findOneAndUpdate(criteria, updateData, option).lean();

            // update driver profile cache
            const driverId = data._id;
            const driverDetails = await updateDriverMapCache(driverId);

            if(data?.is_blocked == 'true') {

                transferTripToCompanyAccount(userInfo , req.io);
                
                // Remove the Driver immidiatly from the map
                removeDriverForSubscribedClients(driverDetails , req.io);
            } else {

                // show the Driver on map 
                await broadcastDriverLocation(req.io , driverId , driverDetails)
            }

        } else {
            return res.send({
                                code: constant.error_code,
                                message:  res.__("blockedUser.error.inValidRoleType" , {role: role})
                            })
        }


        if (!userInfo) {

            return res.send({
                                code: constant.error_code,
                                message: res.__("getDrivers.error.unbaleToUpdate")
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
                                message: data?.is_blocked == 'true' ? res.__("blockedUser.success.userBlocked" , {role: userInfo.role.toLowerCase()}) : res.__("blockedUser.success.userUnblocked" , {role: userInfo.role.toLowerCase()}),

                            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error block user:', err.message);
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
        const ALLOWED_STATUS = Object.values(constant.VEHICLE_UPDATE_STATUS);

        if (!ALLOWED_STATUS.includes(data?.verification_status)) {
            return res.send({
                                code: constant.error_code,
                                message: res.__("getVehicle.error.invalidVerificationStatus")
                            });
        }
        const query = { is_deleted: false};

        if (data?.verification_status === constant.VEHICLE_UPDATE_STATUS.APPROVED) {

             // Approved vehicles with no pending update request
            query.verification_status = constant.VEHICLE_UPDATE_STATUS.APPROVED;
            query.last_admin_status = { $ne: constant.VEHICLE_UPDATE_STATUS.PENDING };

        } else if (data?.verification_status === constant.VEHICLE_UPDATE_STATUS.PENDING) {

            // Vehicles waiting for admin review
            query.last_admin_status = constant.VEHICLE_UPDATE_STATUS.PENDING
        } else if (data?.verification_status === constant.VEHICLE_UPDATE_STATUS.REJECTED) {

            // Vehicles waiting for admin review
            query.last_admin_status = constant.VEHICLE_UPDATE_STATUS.REJECTED
        }
        
        if (search.length > 0) {
            query.$or = [
                { vehicle_number: { $regex: search, $options: "i" } },
                { vehicle_type: { $regex: search, $options: "i" } },
                { vehicle_model: { $regex: search, $options: "i" } },
                { vehicle_make: { $regex: search, $options: "i" } },
                
            ];

            const  isNumber = (search) =>  typeof search === "number" && !isNaN(search); 
           
            if (isNumber(search)) {
                query.$or.push({ seating_capacity: { $regex: Number(search), $options: "i" } })
            }
        }

        
        const totalCount = await VEHICLE.countDocuments(query);

        let get_vehicle = await VEHICLE.find(query).sort({ 'vehicle_number': 1 }).skip(skip).limit(limit).populate([{
            path: "agency_user_id", // The field to populate
            select: "first_name last_name email phone" // Select fields from the users collection
        },
        {
            path: "pending_request_id"   // 👈 full request document, no select
        }]);

        if (!get_vehicle) {
            res.send({
                code: constant.error_code,
                message: res.__("getVehicle.error.getVehicleFailed")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("getVehicle.success.vehicleListRetrieved"),
                totalCount: totalCount,
                result: get_vehicle
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error admin get all al vehicle:', err.message);
        return res.send({
                            code: constant.error_code,
                            message: err.message
                        })
    }
}

exports.vehicleVerificationUpdate = async (req, res) => {
    try{
        
        const data = req.body;
        const vehicleId = req.params.id;
        const decision = data?.verification_status.trim();
        const verification_comment = data?.verification_comment.trim();

        const ALLOWED_STATUS = Object.values(constant.VEHICLE_UPDATE_STATUS);

        if (!ALLOWED_STATUS.includes(decision)) {
            return res.send({
                                code: constant.error_code,
                                message: res.__("getVehicle.error.invalidVerificationStatus")
                            });
        }

        const vehicleDeail = await VEHICLE.findById(vehicleId).populate("pending_request_id").populate("agency_user_id");
       
        if (!vehicleDeail || vehicleDeail?.pending_request_id?.status !== constant.VEHICLE_UPDATE_STATUS.PENDING) {
            return res.send({
                                code: constant.error_code,
                                message: res.__("getVehicle.error.requestNotFoundOrProcessed"),
                                
                            });
        }

        if (verification_comment == '' && decision === constant.VEHICLE_UPDATE_STATUS.REJECTED) {

            return res.send({
                                code: constant.error_code,
                                message: res.__("getVehicle.error.verificationCommentRequired")
                            });
        }

        const vehicleUpdateRequestDetail = await VEHICLE_UPDATE_REQUEST_MODEL.findById(vehicleDeail?.pending_request_id);

        

        if (vehicleDeail?.pending_request_id?.action === constant.VEHICLE_UPDATE_ACTION.CREATE) {

            // CREATE Approved
            if (decision === constant.VEHICLE_UPDATE_STATUS.APPROVED) {

                // add all requested data into vehicle
                Object.assign(vehicleDeail, vehicleUpdateRequestDetail.requested_data);

                vehicleDeail.verification_status  = constant.VEHICLE_UPDATE_STATUS.APPROVED;
                vehicleDeail.verification_comment   = verification_comment;
                vehicleDeail.last_verified_at    =  new Date();

                vehicleDeail.ever_approved    =  true;
                vehicleDeail.last_admin_status = constant.VEHICLE_UPDATE_STATUS.APPROVED;
                vehicleDeail.last_admin_comment = verification_comment;
                vehicleDeail.pending_request_id  = null;

                await vehicleDeail.save();
                vehicleUpdateRequestDetail.status = constant.VEHICLE_UPDATE_STATUS.APPROVED;

            } else {
                // CREATE rejected

                vehicleDeail.verification_status = constant.VEHICLE_UPDATE_STATUS.REJECTED;
                vehicleDeail.verification_comment = verification_comment;

                vehicleDeail.last_admin_status = constant.VEHICLE_UPDATE_STATUS.REJECTED;
                vehicleDeail.last_admin_comment = verification_comment;

                vehicleDeail.pending_request_id = null;
                
                await vehicleDeail.save();
                vehicleUpdateRequestDetail.status = constant.VEHICLE_UPDATE_STATUS.REJECTED;
            }
            
            // UPDATE FLOW (existing approved vehicle)
        } else if (vehicleDeail?.pending_request_id?.action === constant.VEHICLE_UPDATE_ACTION.UPDATE) {

            if (decision === constant.VEHICLE_UPDATE_STATUS.APPROVED) {

                // add all requested data into vehicle
                Object.assign(vehicleDeail, vehicleUpdateRequestDetail.requested_data);

                vehicleDeail.has_pending_update   = false;

                vehicleDeail.verification_status  = constant.VEHICLE_UPDATE_STATUS.APPROVED;
                vehicleDeail.verification_comment   = verification_comment;
                vehicleDeail.last_verified_at    =  new Date();

                vehicleDeail.ever_approved    =  true;
                vehicleDeail.last_admin_status = constant.VEHICLE_UPDATE_STATUS.APPROVED;
                vehicleDeail.last_admin_comment = verification_comment;
                vehicleDeail.pending_request_id  = null;

                await vehicleDeail.save();
                vehicleUpdateRequestDetail.status = constant.VEHICLE_UPDATE_STATUS.APPROVED;
            } else {
                // UPDATE rejected

                vehicleDeail.has_pending_update   = false;

                vehicleDeail.last_admin_status = constant.VEHICLE_UPDATE_STATUS.REJECTED;
                vehicleDeail.last_admin_comment = verification_comment;
                vehicleDeail.pending_request_id  = null;

                await vehicleDeail.save();
                vehicleUpdateRequestDetail.status = constant.VEHICLE_UPDATE_STATUS.REJECTED;
            }
        }

        if (vehicleDeail?.agency_user_id.defaultVehicle == null && decision === constant.VEHICLE_UPDATE_STATUS.APPROVED) {
            
            const vehicleInfo = await VEHICLE.find({agency_user_id: vehicleDeail?.agency_user_id , verification_status :  constant.VEHICLE_UPDATE_STATUS.APPROVED , is_deleted: false})
            
            // If driver have only one vehicle as Approved then it will be default vehicle for the driver
            if (vehicleInfo.length == 1) {

                 await driver_model.findOneAndUpdate({_id: vehicleInfo?.agency_user_id} , { defaultVehicle: vehicleId });
                updateDriverMapCache(vehicleInfo?.agency_user_id);
            }
            
        }

        vehicleUpdateRequestDetail.verification_comment  = verification_comment;
        vehicleUpdateRequestDetail.reviewed_by  = req.userId;
        vehicleUpdateRequestDetail.reviewed_at = new Date();
        await vehicleUpdateRequestDetail.save()

        return res.send({
            code: constant.success_code,
            message: res.__("getVehicle.success.vehicleVerificationUpdated")

        })
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error block user:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.vehicleMakeDefault = async (req, res) => {

    try{

        const vehicleId = req.params.id;

        let vehicle = await VEHICLE.findOne({_id: vehicleId , agency_user_id: req.userId , is_deleted: false});

        if (!vehicle) {
            return res.send({
                                code: constant.error_code,
                                message:  res.__("getVehicle.error.noVehicleFound"),
                            })
        }


        if (vehicle.verification_status === constant.VEHICLE_UPDATE_STATUS.APPROVED && !vehicle.pending_request_id) {

                await driver_model.findOneAndUpdate({_id: req.userId , defaultVehicle: vehicleId})
                updateDriverMapCache(req.userId);
                return res.send({
                            code: constant.error_code,
                            message:  res.__("getVehicle.success.vehicleSetAsDefault"),
                        })

        } else if (vehicle.verification_status === constant.VEHICLE_UPDATE_STATUS.REJECTED && !vehicle.pending_request_id){

            return res.send({
                            code: constant.error_code,
                            message:  res.__("getVehicle.error.vehicleRejectedCannotBeDefault"),
                        })
        } else {

            return res.send({
                            code: constant.error_code,
                            message:  res.__("getVehicle.error.vehicleUnderReviewCannotBeDefault"),
                        })
        }

          return res.send({
                                code: constant.error_code,
                                message:  vehicle,
                            })

    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error vehicleMakeDefault:', err.message);
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

