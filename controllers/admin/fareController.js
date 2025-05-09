const VEHICLE = require("../../models/user/vehicle_model");
const USER = require("../../models/user/user_model");
const VEHICLETYPE = require("../../models/admin/vehicle_type");
const FARE = require("../../models/user/fare_model");
const SETTINGS = require("../../models/user/setting_model");
// const VEHICLETYPE = require('../../models/user/trip_model')
const constant = require("../../config/constant");

exports.add_fare = async (req, res) => {
  try {
    let data = req.body;
    let checkFare = await FARE.findOne({
      vehicle_type: data.vehicle_type,
      created_by: req.userId,
      is_deleted: false,
    });
    if (checkFare) {
      res.send({
        code: constant.error_code,
        message: "You have already added fare for this vehicle type",
      });
      return;
    }
    data.created_by = req.userId;
    let save_data = await FARE(data).save();
    if (!save_data) {
      res.send({
        code: constant.error_code,
        message: "Unable to create the fare",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Saved successfully",
        result: save_data,
      });
    }
  } catch (err) {
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
        message: "Check your token or id",
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
    }).sort({ vehicle_type: 1 });
    if (!getData) {
      res.send({
        code: constant.error_code,
        message: "No Data Found",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Successfully fetched",
        result: getData,
      });
    }
  } catch (err) {
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
        message: "Invalid company",
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
        message: "No Data Found",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Successfully fetched",
        result: getData,
      });
    }
  } catch (err) {
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
        message: "Check your token or id",
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
    }).sort({ createdAt: -1 });
    if (!getData) {
      res.send({
        code: constant.error_code,
        message: "No Data Found",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Successfully fetched",
        result: getData,
      });
    }
  } catch (err) {
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
        message: "Unable to fetch the details",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Success",
        resizeTo: getFareDetail,
      });
    }
  } catch (err) {
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
        message: "Unable to delete the fare",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Deleted Successfully",
      });
    }
  } catch (err) {
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
    let update_fare = await FARE.findByIdAndUpdate(criteria, data, option);
    if (!update_fare) {
      res.send({
        code: constant.error_code,
        message: "Unable to update the fare",
      });
    } else {
      res.send({
        code: constant.success_code,
        message: "Updated successfully",
        result: update_fare,
      });
    }
  } catch (err) {
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
                      message: `The settings have been successfully updated.`,
                    });
  } catch (err) {

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};
