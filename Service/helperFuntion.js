require("dotenv").config()
const jwt = require("jsonwebtoken");
const User = require("../models/user/user_model");
const driver_model = require("../models/user/driver_model");
const user_model = require("../models/user/user_model");
const { default: axios } = require("axios");

exports.driverDetailsByToken = async (token) => {
    console.log("🚀 ~ file: helperFuntion.js:6 ~ exports.driverDetailsByToken= ~ token:", token)
    const {userId} = jwt.verify(token, process.env.JWTSECRET);
  console.log("getCustomerDetailsByTokenId===>", userId)
//   // find driver by id in database
  const driver =  await driver_model.findOne({_id : userId})
  console.log("🚀 ~ file: helperFuntion.js:11 ~ exports.driverDetailsByToken= ~ driver:", driver)
  return driver
  
}
exports.userDetailsByToken = async (token) => {
  const {userId} = jwt.verify(token, process.env.JWTSECRET);
  console.log("🚀 ~ exports.userDetailsByToken= ~ userId:", userId)
//   // find driver by id in database
const user =  await user_model.findOne({_id : userId})
return user

}

exports.sendNotification = async(to,message,title,data)=>{
  try {
    const response = await axios.post(
      "https://fcm.googleapis.com/fcm/send",
      {
        to: driverById?.deviceToken,
        notification: {
          message,
          title,
          data,
          sound: "default"
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization:
            `key=${process.env.FCM_SERVER_KEY}`,
        },
      }
    );
    return response;
  } catch (error) {
    throw error
  }
}