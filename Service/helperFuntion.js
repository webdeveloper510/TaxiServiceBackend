require("dotenv").config()
const jwt = require("jsonwebtoken");
const User = require("../models/user/user_model");
const driver_model = require("../models/user/driver_model");
const user_model = require("../models/user/user_model");
const { default: axios } = require("axios");
const admin = require('firebase-admin');
const serviceAccount = require('../taxi24-5044e-firebase-adminsdk-khmt0-c7c4ce0029.json');
const twilio = require('twilio');
// Initialize Twilio client
const client = twilio(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
exports.driverDetailsByToken = async (token) => {
    // console.log("🚀 ~ file: helperFuntion.js:6 ~ exports.driverDetailsByToken= ~ token:", token)
    const {userId} = jwt.verify(token, process.env.JWTSECRET);
  // console.log("getCustomerDetailsByTokenId===>", userId)
//   // find driver by id in database
  const driver =  await driver_model.findOne({_id : userId})
  // console.log("🚀 ~ file: helperFuntion.js:11 ~ exports.driverDetailsByToken= ~ driver:", driver)
  return driver
  
}

exports.sendSms = async (data) => {

  try {

    let payload = {
      body: data.message, 
      to: data.to,               
      from: '+3197010204679'     
    }
    const message = await client.messages.create(payload);
    
  } catch (error) {

    
  }
}
exports.userDetailsByToken = async (token) => {
  const {userId} = jwt.verify(token, process.env.JWTSECRET);
  console.log("🚀 ~ exports.userDetailsByToken= ~ userId:", userId)
//   // find driver by id in database
const user =  await user_model.findOne({_id : userId})
return user

}

exports.isDriverHasCompanyAccess = async (driver_data , company_id) => { // Check If driver has companies account access
  
  
  return driver_data.company_account_access.some(account => account.company_id.toString() === company_id.toString()); // return true if driver has access otherwise it will return false
}

exports.sendNotification = async (to,message,title,data)=>{

  // console.log("get token--------------->" , to)
  let device_token = to;
  try {
    
    
    const messageData = {
      token: to,  // The device token to send the message to
      notification: {
        title: title,       // Notification title
        body: message,      // Notification body
      },
      android: {
        notification: {
          sound: 'default', // Play default notification sound on Android
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default', // Play default notification sound on iOS
          },
        },
      },
    };
const response = await admin.messaging().send(messageData);
// console.log ('Notification sent:', response);
    return response
  } catch (error) {

    if (error.code == 'messaging/registration-token-not-registered') {

      await driver_model.updateOne(
        { deviceToken: device_token }, // Find the user device token 
        { $set: { deviceToken: "" } } // Replace 'fcmToken' with your actual token field name
      );
      await user_model.updateOne(
        { deviceToken: device_token }, // Find the user device token 
        { $set: { deviceToken: "" } } // Replace 'fcmToken' with your actual token field name
      );
      return "This token is invalid";
    }
    
    return error
  }
}

//   try {
//     const accessToken = await getAccessToken();

//     const response = await axios.post(
//       `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
//       {
//         message: {
//           token: driverById?.deviceToken,
//           notification: {
//             title: `Your trip has been retrieved by company ${user.first_name} ${user.last_name}`,
//             body: `Your trip has been retrieved by company ${user.first_name} ${user.last_name}`,
//           },
//           data: {
//             trip: JSON.stringify(trip),
//           },
//         },
//       },
//       {
//         headers: {
//           "Content-Type": "application/json",
//           Authorization: `Bearer ${accessToken}`,
//         },
//       }
//     );

//     res.status(200).json(response.data);
//   } catch (error) {
//     next(error);
//   }
// };