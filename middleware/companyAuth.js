const { verify } = require("crypto");
const jwt = require("jsonwebtoken");
var config = require("../config/constant");
const USER = require("../models/user/user_model");
const AGENCY = require("../models/user/agency_model");
const constant = require("../config/constant");
const user_model = require("../models/user/user_model");
const driver_model = require("../models/user/driver_model");
const constants = require("../config/constant");

// const config = process.env
const companyAuthMiddleware = async (req, res, next) => {
  try {
    
    if (req.user.role == constants.ROLES.COMPANY) {

        next();
    } else {
      return res.send({
            status: constant.error_code,
            Message: "You do not have the necessary permissions to perform this action.",
          });
    
    }
    
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error copnay auth midlle ware:', err.message);
    return res.send({
      status: constant.error_code,
      Message: "You do not have the necessary permissions to perform this action.",
    });
  }
};
const companyAuth = {
    companyAuth: companyAuthMiddleware,
};
module.exports = companyAuth;