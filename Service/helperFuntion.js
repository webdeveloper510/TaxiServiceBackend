require("dotenv").config()
const jwt = require("jsonwebtoken");
const User = require("../models/user/user_model");
const driver_model = require("../models/user/driver_model");

exports.driverDetailsByToken = async (token) => {
    console.log("🚀 ~ file: helperFuntion.js:6 ~ exports.driverDetailsByToken= ~ token:", token)
    const {userId} = jwt.verify(token, process.env.JWTSECRET);
  console.log("getCustomerDetailsByTokenId===>", userId)
//   // find driver by id in database
  const driver =  await driver_model.findOne({_id : userId})
  console.log("🚀 ~ file: helperFuntion.js:11 ~ exports.driverDetailsByToken= ~ driver:", driver)
  return driver
  
}