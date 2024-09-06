require("dotenv").config()
const jwt = require("jsonwebtoken");
const User = require("../models/user/user_model");
const driver_model = require("../models/user/driver_model");
const user_model = require("../models/user/user_model");
const { default: axios } = require("axios");
const admin = require('firebase-admin');
const serviceAccount = require('../taxi24-5044e-firebase-adminsdk-khmt0-c7c4ce0029.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
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

exports.sendNotification = async (to,message,title,data)=>{

  try {
    const messageData = {
      notification: {
        title: title,       // Notification title (shown in system notification)
        body: message,      // Notification body (shown in system notification)
      },
      data: {
        sound: "default",
      },
      token: to,
    }; 
const response = await admin.messaging().send(messageData);
console.log ('Notification sent:', response);
    return response
  } catch (error) {
    throw error
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