require("dotenv").config();
const jwt = require("jsonwebtoken");
const User = require("../models/user/user_model");
const driver_model = require("../models/user/driver_model");
const user_model = require("../models/user/user_model");
const AGENCY_MODEL = require("../models/user/agency_model.js");
const { default: axios } = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("../taxi24-5044e-firebase-adminsdk-khmt0-c7c4ce0029.json");
const twilio = require("twilio");
const mongoose = require("mongoose");
const CONSTANT = require("../config/constant");
const constant = require("../config/constant");
// Initialize Twilio client
const client = twilio(process.env.ACCOUNT_SID, process.env.AUTH_TOKEN);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});
exports.driverDetailsByToken = async (token) => {
  const { userId } = jwt.verify(token, process.env.JWTSECRET);

  //   // find driver by id in database
  const driver = await driver_model.findOne({ _id: userId });

  return driver;
};

exports.sendSms = async (data) => {
  try {
    let payload = {
      body: data.message,
      to: data.to,
      from: "+3197010204679",
    };
    // const message = await client.messages.create(payload);
  } catch (error) {}
};
exports.userDetailsByToken = async (token) => {
  const { userId } = jwt.verify(token, process.env.JWTSECRET);

  //   // find driver by id in database
  const user = await user_model.findOne({ _id: userId });
  return user;
};

// When driver will not found the customer on trip start location then it will called no show case
exports.noShowTrip = async (companyId , trip_data , message, io) => {

  const companyData = await user_model.findOne({ _id: companyId  , role: constant.ROLES.COMPANY});
  const companyMetaData = await AGENCY_MODEL.findOne({user_id: companyId});
  console.log('companyId-----' , companyId);
  if (companyData?.socketId) {
    await io.to(companyData?.socketId).emit("noShow", { message , trip_data } )
  }

  // Informed to the company when driver didn't  find the  customer  on pickup location
  if (companyData?.deviceToken) {
    this.sendNotification(companyData?.deviceToken , message , 'NO SHOW CUSTOMER' , {})
  }

  if (companyData?.webSocketId) {
    console.log('companyData?.webSocketId------' , companyData?.webSocketId)
    await io.to(companyData?.webSocketId).emit("noShow", { message , trip_data })
  }

  // functionality for the drivers who have account access as partner

  const driverHasCompanyPartnerAccess = await driver_model.find({
                                                                  _id: { $ne: trip_data.driver_name}, //Notifications and pop-ups will exclude the driver currently assigned to the ride.
                                                                  parnter_account_access  : {
                                                                                              $elemMatch: { company_id: new mongoose.Types.ObjectId(companyId) },
                                                                                            },
                                                                });

  if (driverHasCompanyPartnerAccess){

    for (let partnerAccount of driverHasCompanyPartnerAccess) {


      // for partner app side
      if (partnerAccount?.socketId) {

        // for refresh trip
        await io.to(partnerAccount?.socketId).emit("noShow", { message , trip_data } )
      }

      // for partner web side
      if (partnerAccount?.webSocketId) {

        // for refresh trip
        await io.to(partnerAccount?.webSocketId).emit("noShow", { message , trip_data } )
      }

      // Informed to the company when driver didn't  find the  customer  on pickup location
      if (partnerAccount?.deviceToken) {
        this.sendNotification(partnerAccount?.deviceToken , message , 'NO SHOW CUSTOMER ( Partner Account Access:-  ${companyMetaData?.company_name})' , {})
      }
    }
  }

  // For the driver who has company access

  const driverHasCompanyAccess = await driver_model.find({
                                                            _id: { $ne: trip_data.driver_name}, //Notifications and pop-ups will exclude the driver currently assigned to the ride.
                                                            company_account_access  : {
                                                                                        $elemMatch: { company_id: new mongoose.Types.ObjectId(companyId) },
                                                                                      },
                                                        });

  if (driverHasCompanyAccess){

    for (let driverCompanyAccess of driverHasCompanyAccess) {


      // for partner app side
      if (driverCompanyAccess?.socketId) {
        console.log('driverCompanyAccess----------' , driverCompanyAccess.first_name , trip_data.driver_name)
        // for refresh trip
        await io.to(driverCompanyAccess?.socketId).emit("noShow", { message , trip_data } )
      }

      // for partner web side
      if (driverCompanyAccess?.webSocketId) {

        // for refresh trip
        await io.to(driverCompanyAccess?.webSocketId).emit("noShow", { message , trip_data } )
      }

      // Informed to the company when driver didn't  find the  customer  on pickup location
      if (driverCompanyAccess?.deviceToken) {
        this.sendNotification(driverCompanyAccess?.deviceToken , message , `NO SHOW CUSTOMER (Account Access:-  ${companyMetaData?.company_name})`  , {})
      }
    }
  }
  
}

exports.partnerAccountRefreshTrip = async (companyId , message, io) => {

  const companyData = await user_model.findOne({ _id: companyId });

  if (companyData?.socketId) {
    await io.to(companyData?.socketId).emit("refreshTrip", { message: message } )
  }

  if (companyData?.webSocketId) {
    console.log('companyData?.webSocketId------' , companyData?.webSocketId)
    await io.to(companyData?.webSocketId).emit("refreshTrip", { message: message })
  }

  // functionality for the drivers who have account access as partner

  const driverHasCompanyPartnerAccess = await driver_model.find({
                                                                  parnter_account_access  : {
                                                                                              $elemMatch: { company_id: new mongoose.Types.ObjectId(companyId) },
                                                                                            },
                                                                });

  if (driverHasCompanyPartnerAccess){

    for (let partnerAccount of driverHasCompanyPartnerAccess) {


      // for partner app side
      if (partnerAccount?.socketId) {

        // for refresh trip
        await io.to(partnerAccount?.socketId).emit("refreshTrip", { message: message } )
      }

      // for partner web side
      if (partnerAccount?.webSocketId) {

        // for refresh trip
        await io.to(partnerAccount?.webSocketId).emit("refreshTrip", { message: message } )
      }
    }
  }

  // For the driver who has company access

  const driverHasCompanyAccess = await driver_model.find({
                                                            company_account_access  : {
                                                                                        $elemMatch: { company_id: new mongoose.Types.ObjectId(companyId) },
                                                                                      },
                                                        });

  if (driverHasCompanyAccess){

    for (let driverCompanyAccess of driverHasCompanyAccess) {


      // for partner app side
      if (driverCompanyAccess?.socketId) {

        // for refresh trip
        await io.to(driverCompanyAccess?.socketId).emit("refreshTrip", { message: message } )
      }

      // for partner web side
      if (driverCompanyAccess?.webSocketId) {

        // for refresh trip
        await io.to(driverCompanyAccess?.webSocketId).emit("refreshTrip", { message: message } )
      }
    }
  }


  // For Super Admin 

  const superAdminData = await user_model.find({ role: { $in: [ CONSTANT.ROLES.ADMIN, CONSTANT.ROLES.SUPER_ADMIN] } });

  if (superAdminData){

    for (let admin of superAdminData) {


      // for partner app side
      if (admin?.webSocketId) {
        
        // for refresh trip
        await io.to(admin?.webSocketId).emit("refreshTrip", { message: message } )
      }
    }
  }
  
}

exports.isDriverHasCompanyAccess = async (driver_data, company_id) => {
  // Check If driver has companies account access

  return driver_data.company_account_access.some( (account) => account.company_id.toString() === company_id.toString() ); // return true if driver has access otherwise it will return false
};

exports.sendNotification = async (to, message, title, data) => {
  let device_token = to;
  try {
    const messageData = {
      token: to, // The device token to send the message to
      notification: {
        title: title, // Notification title
        body: message, // Notification body
      },
      android: {
        notification: {
          sound: "default", // Play default notification sound on Android
        },
      },
      apns: {
        payload: {
          aps: {
            sound: "default", // Play default notification sound on iOS
          },
        },
      },
    };
    const response = await admin.messaging().send(messageData);

    return response;
  } catch (error) {
    if (error.code == "messaging/registration-token-not-registered") {
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

    return error;
  }
};

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
