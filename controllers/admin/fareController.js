const USER = require("../../models/user/user_model");
const FARE = require("../../models/user/fare_model");
const SETTINGS = require("../../models/user/setting_model");
const CAR_TYPE = require('../../models/admin/car_type_model')
// const VEHICLETYPE = require('../../models/user/trip_model')
const constant = require("../../config/constant");
const mongoose = require("mongoose");

exports.add_fare = async (req, res) => {
  try {
    let data = req.body;
    const id = (data.car_type_id || '').trim()
    
    let checkCarType = await CAR_TYPE.findOne({_id: new mongoose.Types.ObjectId(id), is_deleted: false});

    if (!checkCarType) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addFare.error.invalidCarType'),
                      });
      
    }
    
    const checkFare = await FARE.findOne({
                                          car_type_id: checkCarType._id,
                                          created_by: req.userId,
                                          is_deleted: false,
                                        });
    if (checkFare) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addFare.error.fareAlreadyExistsForVehicleType'),
                      });
    }

    const fareData = {
      car_type: checkCarType.name,
      car_type_id: checkCarType._id,
      vehicle_fare_per_km: data.vehicle_fare_per_km,
      minimum_fare: data.minimum_fare,
      per_minute_fare: data.per_minute_fare,
      start_fare: data.start_fare,
      waiting_fare: data.waiting_fare,
      km_10_fare: data.km_10_fare,
      km_25_fare:data.km_25_fare,
      created_by: req.userId,
    }
    let save_data = await FARE(fareData).save();
    if (!save_data) {
      res.send({
        code: constant.error_code,
        message: res.__('addFare.error.unableToAddFare'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addFare.success.fareAdded'),
        result: save_data,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ add fare error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_fares = async (req, res) => {
  try {
    let data = req.body;
    let userId = req.params.id;
    let get_user = await USER.findOne({ _id: req.userId || userId });
    if (!get_user) {
      res.send({
        code: constant.error_code,
        message: res.__('getFare.error.invalidUser'),
      });
    }

    let getData = await FARE.find({
      $and: [
        {
          $or: [
            { created_by: req.userId },
            { created_by: get_user.created_by },
            { created_by: get_user._id },
          ],
        },
        { is_deleted: false },
      ],
    }).populate({
                  path: 'car_type_id',      // populate the field
                  match: { is_deleted: false }, // optional filter to exclude deleted car types
                  select: `passangerLimit`
                })
    .sort({ vehicle_type: 1 });

    let result = await getData.map(fare => {
                                    const plain = fare.toObject(); // convert Mongoose document to plain JS object

                                    if (plain.car_type_id) {
                                      plain.passangerLimit = plain.car_type_id.passangerLimit;
                                      plain.car_type_id = plain.car_type_id._id;
                                    }

                                    return plain;
                                  });

    if (!getData) {
      res.send({
        code: constant.error_code,
        message: res.__('getFare.error.noDataFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('getFare.success.fareRetrieved'),
        result: result,
      });
    }
  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌ get fare error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.companyGetFares = async (req, res) => {
  try {
    let data = req.body;
    let companyId = req.params.company_id;
    let companydata = await USER.findOne({ role: "COMPANY", _id: companyId });

    if (!companyId || !companydata) {

      return res.send({
        code: constant.error_code,
        message: res.__('companyGetFares.error.invalidCompany'),
      });
    } 

    let getData = await FARE.find({
      $and: [
        {
          $or: [
            { created_by: companyId },
            { created_by: companydata.created_by },
          ],
        },
        { is_deleted: false },
      ],
    }).sort({ createdAt: -1 });
    if (!getData) {
      res.send({
        code: constant.error_code,
        message: res.__('companyGetFares.error.noDataFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('companyGetFares.success.fareRetrieved'),
        result: getData,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ compnay get fare error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.access_get_fares = async (req, res) => {
  try {
    let data = req.body;
    let userId = req.params.id;

    let get_user = await USER.findOne({ _id: req.body.company_id });
    if (!get_user) {
      res.send({
        code: constant.error_code,
        message: res.__('companyGetFares.error.invalidCompany'),
      });
    }

    let getData = await FARE.find({
      $and: [
        {
          $or: [
            { created_by: req.userId },
            { created_by: get_user.created_by },
            { created_by: get_user._id },
          ],
        },
        { is_deleted: false },
      ],
    }).populate({
                  path: 'car_type_id',      // populate the field
                  match: { is_deleted: false }, // optional filter to exclude deleted car types
                  select: `passangerLimit`
                })
    .sort({ createdAt: -1 });

    let result = await getData.map(fare => {
                                    const plain = fare.toObject(); // convert Mongoose document to plain JS object

                                    if (plain.car_type_id) {
                                      plain.passangerLimit = plain.car_type_id.passangerLimit;
                                      plain.car_type_id = plain.car_type_id._id;
                                    }

                                    return plain;
                                  });
    if (!result) {
      return res.send({
        code: constant.error_code,
        message: res.__('companyGetFares.error.noDataFound')
      });
    } else {
      return res.send({
        code: constant.success_code,
        message: res.__('companyGetFares.success.fareRetrieved'),
        result: result,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ access get fare error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_fare_detail = async (req, res) => {
  try {
    let data = req.body;
    let getFareDetail = await FARE.findOne({ _id: req.params.id });
    if (!getFareDetail) {
      res.send({
        code: constant.error_code,
        message: res.__('companyGetFares.error.noDataFound'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('companyGetFares.success.fareRetrieved'),
        resizeTo: getFareDetail,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ get fare details error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.delete_fare = async (req, res) => {
  try {
    let data = req.params;
    let criteria = { _id: data.id };
    let newValue = {
      $set: {
        is_deleted: true,
      },
    };
    let option = { new: true };
    let delete_fare = await FARE.findByIdAndUpdate(criteria, newValue, option);
    if (!delete_fare) {
      res.send({
        code: constant.error_code,
        message: res.__('deleteFares.error.unableToDeleteFare'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('deleteFares.success.fareDeleted'),
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ delete fare error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.edit_fare = async (req, res) => {
  try {
    let data = req.body;
    let criteria = { _id: req.params.id };
    let option = { new: true };

    let checkCarType = await CAR_TYPE.findOne({_id: new mongoose.Types.ObjectId(data.car_type_id), is_deleted: false});

    if (!checkCarType) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addFare.error.invalidCarType'),
                      });
      
    }

    const checkFare = await FARE.findOne({_id: { $ne: criteria._id}, car_type_id: data.car_type_id ,   is_deleted: false , created_by: req.userId});

    if (checkFare) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('addFare.error.fareAlreadyExistsForVehicleType'),
                      });
      
    }

    const updateData = {
      car_type: checkCarType.name,
      car_type_id: checkCarType._id,
      vehicle_fare_per_km: data.vehicle_fare_per_km,
      minimum_fare: data.minimum_fare,
      per_minute_fare: data.per_minute_fare,
      waiting_fare: data.waiting_fare,
      km_10_fare: data.km_10_fare,
      km_25_fare:data.km_25_fare,
      start_fare: data.start_fare
    }
    let update_fare = await FARE.findByIdAndUpdate(criteria, {$set:updateData}, option);
    if (!update_fare) {
      res.send({
        code: constant.error_code,
        message: res.__('addFare.error.unableToAddFare'),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__('addFare.success.fareUpdated'),
        result: update_fare,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ edit fare error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.adminSettings = async (req, res) => {
  try {
    const settings = await SETTINGS.find()
    res.send({
      code: constant.success_code,
      message:settings,
    });
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ addmin setting error --------------' , err.message)
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.updateAdminSettings = async (req, res) => {
  try {

    let data = req.body
    const settings = await SETTINGS.find()
    
    for (const key in data) {
      
        const matchedKey = Object.values(constant.ADMIN_SETTINGS).find(value => value === key);

        if (matchedKey) {

            let checkKeyExist = await SETTINGS.findOne({key: key});

            if (checkKeyExist) {

              // settings will be updated
              let updated_data = { value : data[key] };
              let option = { new: true };
              await SETTINGS.findOneAndUpdate({key: key} , updated_data ,option);
              
              
            } else {

              // New settings will be added
              const newSetting = new SETTINGS({ key: key, value: data[key] });
              await newSetting.save();
              
            }
        
        }
    }

    return res.send({
                      code: constant.success_code,
                      message: res.__('adminSetting.success.settingsUpdated'),
                    });
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌ update setting error --------------' , err.message)
    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};
