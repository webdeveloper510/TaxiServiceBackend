require("dotenv").config();
const i18n = require("i18n");
const jwt = require("jsonwebtoken");
const driver_model = require("../models/user/driver_model");
const VEHICLE_MODEL = require("../models/user/vehicle_model");
const user_model = require("../models/user/user_model");
const SMS_TRANSACTION = require("../models/user/sms_transaction_model");
const AGENCY_MODEL = require("../models/user/agency_model.js");
const TRIP_MODEL = require("../models/user/trip_model.js");
const SUBSCRIPTION_MODEL = require("../models/user/subscription_model");
const PLANS_MODEL = require("../models/admin/plan_model");
const { default: axios } = require("axios");
const admin = require("firebase-admin");
const serviceAccount = require("../taxi24-5044e-firebase-adminsdk-khmt0-c7c4ce0029.json");
const twilio = require("twilio");
const mongoose = require("mongoose");
const CONSTANT = require("../config/constant");
const constant = require("../config/constant");
const nodemailer = require("nodemailer");
const emailConstant = require("../config/emailConstant");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const IBAN = require('iban');
const sendEmail = require("./email");
const { getCityByPostcode } = require("../utils/getCityAndCountryByZipcode.js")
const { formatPhoneNumber } = require("../utils/phoneFormat.js")
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

exports.createConnectedAccount = async (email ) =>{
  try {

    // const account = await stripe.accounts.create({
    //     type: 'custom',
    //     country: 'NL', // Country of the bank account
    //     capabilities: {
    //         card_payments: { requested: true },
    //         transfers: { requested: true }
    //     },
    //     business_type: 'individual', // or 'company', depending on the user
    //     tos_acceptance: {
    //         date: Math.floor(Date.now() / 1000), // Current time in seconds
    //         ip: '127.0.0.1', // Replace with the user's actual IP
    //     }
    // });
    // console.log('Connected Account Created:', account.id);

    const account = await stripe.accounts.create({
      country: 'NL',
      email: email, 
      capabilities: {
                      card_payments: { requested: true },
                      transfers: { requested: true },
                    },
      business_type: 'individual',
      external_accounts: {
                              object: 'bank_account',
                              country: 'NL',
                              currency: 'eur',
                          },
      controller: {
                    fees: {
                      payer: 'application',
                    },
                    losses: {
                      payments: 'application',
                    },
                    stripe_dashboard: {
                      type: 'express',
                    },
                  },
    });
    console.log('account.id------' , JSON.stringify(account))
    return account.id;
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error create connect account:', error.message);
      console.error('Error creating connected account:', error);
      throw error;
  }
}


exports.attachBankAccount = async (connectedAccountId, accountTokenId) => {
  try {

    const externalBankAccount = await stripe.accounts.createExternalAccount(
      connectedAccountId,
      { external_account: accountTokenId, }
    );

    return externalBankAccount
      // const externalAccount = await stripe.accounts.createExternalAccount(
      //     connectedAccountId,
      //     {
      //         external_account: {
      //             object: 'bank_account',
      //             country: 'NL', // Country code
      //             currency: 'eur', // Currency
      //             account_holder_name: bankDetails.accountHolderName,
      //             account_holder_type: 'individual', // or 'company'
      //             iban: bankDetails.iban // IBAN for Netherlands
      //         }
      //     }
      // );
      // console.log('Bank Account Attached:', externalAccount);
      // return externalAccount.id;
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error attach banka ccount:', error.message);
      
    throw error;
  }
}

// create account during user's creation
exports.createCustomAccount = async (email) => {
  try {
      const account = await stripe.accounts.create({
        country: 'NL',
        email: email,
        type: 'custom',
        business_type: 'company', // or 'individual'
        capabilities: {
          card_payments: {
            requested: true,
          },
          transfers: {
            requested: true,
          },
        },
      });


    console.log('account.id------' , JSON.stringify(account))
    return account.id;
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error create custom account:', error.message);
      console.error("Error creating account:", error);
      throw error;
  }
};

// User onboard's link for stripe after custom account creation
exports.stripeOnboardingAccountLink = async (accountId , user_id) => {
  try {
      const accountLink = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: `${process.env.BASEURL}/bank-account-verification-pending/${user_id}`,
          return_url: `${process.env.BASEURL}/bank-account-verification-completed/${user_id}`,
          type: 'account_onboarding',
      });

      console.log("Onboarding Link:", accountLink.url);
      return accountLink.url;
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error stripe onboarding link:', error.message);
      console.error("Error creating account link:", error);
  }
};


exports.getConnectedAccountKycStatus = async (account) => {
    const req = account?.requirements || {};

    const currentlyDue = req.currently_due || [];
    const eventuallyDue = req.eventually_due || [];
    const errors = req.errors || [];
    const deadline = req.current_deadline;

    // Only fields ending with .verification.document are ID documents
    const identityDocumentDue = currentlyDue.filter(f =>
        f.includes(".verification.document")
    );

    return {
        needsIdentityDocument: identityDocumentDue.length > 0,
        identityFields: identityDocumentDue,
        errors,
        deadline,
        allCurrentlyDue: currentlyDue,
        allEventuallyDue: eventuallyDue,
    };
}

// User onboard's link for stripe after custom account creation
exports.getConnectedAccountDetails = async (accountId) => {
  try {

    const account = await stripe.accounts.retrieve(accountId);
    // console.log("Account Details:", account);
    return account;
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error get connected account details:', error.message);
  }
};



exports.updateBankAccount = async (connectedAccountId, newBankDetails) => {
  try {
      // Validate IBAN format
      if (!IBAN.isValid(newBankDetails.iban)) {
          throw new Error('Invalid IBAN format. Please provide a valid IBAN.');
      }

      // Get all external accounts (bank accounts) for the connected account
      const bankAccounts = await stripe.accounts.listExternalAccounts(connectedAccountId, { object: 'bank_account' });

      if (bankAccounts.data.length === 0) {
          throw new Error('No bank account found for this user.');
      }

      // Assume the first bank account is the one to update (you can modify this if needed)
      const oldBankAccountId = bankAccounts.data[0].id;

      console.log(`Old Bank Account Found: ${oldBankAccountId}, Deleting it...`);

      // Remove the old bank account
      await stripe.accounts.deleteExternalAccount(connectedAccountId, oldBankAccountId);
      console.log('Old Bank Account Removed Successfully');

      // Tokenize the new bank account
      const token = await stripe.tokens.create({
          bank_account: {
              country: 'NL',
              currency: 'eur',
              account_holder_name: newBankDetails.accountHolderName,
              account_holder_type: 'individual', // or 'company'
              iban: newBankDetails.iban
          }
      });

      console.log('New Bank Account Token Created:', token.id);

      // Attach the new bank account
      const externalAccount = await stripe.accounts.createExternalAccount(
          connectedAccountId,
          { external_account: token.id }
      );

      console.log('New Bank Account Attached Successfully:', externalAccount.id);
      return externalAccount.id;

  } catch (error) {
      console.log('❌❌❌❌❌❌❌❌❌Error updating bank account:', error.message);
      throw new Error(`Failed to update bank account: ${error.message}`);
  }
}

exports.sendPayout = async (amount, connectedAccountId) => {
  try {
      const payout = await stripe.payouts.create(
                                                    {
                                                      amount : amount * 100, // Amount in cents (e.g., 1000 = €10.00)
                                                        currency: 'eur', // Currency
                                                    },
                                                    {
                                                        stripeAccount: connectedAccountId, // The connected account ID
                                                    }
                                                );
      
      console.log('Payout Successful:', payout);
      return payout;
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error sendPayout:', error.message);
      console.error('Error sending payout:', error);
      throw error;
  }
}

exports.sendSms = async (data) => {
  try {
    
    let payload = {
                    body: data.message,
                    to: data.to,
                    from: countryCode === `+${CONSTANT.NETHERLANDS_COUNTRY_CODE}` ? this.getSenderId(data?.senderName).slice(0, 11) :"+3197010204679", // +31 in netherland we can send sender id as alphanumeric with 11 charater 
                  }; 
    if (process.env.IS_SMS_FUNCTIONALITY_ACTIVE == `true`) {
      const message = await client.messages.create(payload);
      console.log("🚀 Sms has been sent to---" , data.to)
    }
    // const message = await client.messages.create(payload);
    return true
   
    return message
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error send sms:', error.message);
   
  }
};

exports.getSenderId = (senderName) => {
  if (!senderName || typeof senderName !== "string") {
    return "AMSTAXI"; // fallback brand
  }

  // Remove non-alphanumeric characters
  const cleaned = senderName.replace(/[^a-zA-Z0-9]/g, "");

  // Must contain at least one letter
  if (!/[a-zA-Z]/.test(cleaned)) {
    return "AMSTAXI";
  }

  return cleaned.slice(0, 11);
}

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
  
  if (companyData?.socketId) {

    let targetLocale = companyData?.app_locale || process.env.DEFAULT_LANGUAGE;
    let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
    await io.to(companyData?.socketId).emit("noShow", { message , trip_data } )
  }

  // Informed to the company when driver didn't  find the  customer  on pickup location
  if (companyData?.deviceToken) {

    let targetLocale = companyData?.app_locale || process.env.DEFAULT_LANGUAGE;
    let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
    this.sendNotification(companyData?.deviceToken , message , 'NO SHOW CUSTOMER' , {})
  }

  if (companyData?.webSocketId) {
    
    let targetLocale = companyData?.web_locale || process.env.DEFAULT_LANGUAGE;
    let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
    await io.to(companyData?.webSocketId).emit("noShow", { message , trip_data })
  }

  // Informed to the company when driver didn't  find the  customer  on pickup location
  if (companyData?.webDeviceToken) {

    let targetLocale = companyData?.web_locale || process.env.DEFAULT_LANGUAGE;
    let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
    this.sendNotification(companyData?.webDeviceToken , message , 'NO SHOW CUSTOMER' , {})
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

        let targetLocale = partnerAccount?.app_locale || process.env.DEFAULT_LANGUAGE;
        let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
        // for refresh trip
        await io.to(partnerAccount?.socketId).emit("noShow", { message , trip_data } )
      }

      // for partner web side
      if (partnerAccount?.webSocketId) {

        let targetLocale = partnerAccount?.web_locale || process.env.DEFAULT_LANGUAGE;
        let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
        // for refresh trip
        await io.to(partnerAccount?.webSocketId).emit("noShow", { message , trip_data } )
      }

      // Informed to the company when driver didn't  find the  customer  on pickup location
      if (partnerAccount?.deviceToken) {

        let targetLocale = partnerAccount?.app_locale || process.env.DEFAULT_LANGUAGE;
        let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
        let title = i18n.__({ phrase: "editTrip.notification.noShowCustomerPartnerAccountTitle", locale: targetLocale }, { company_name: companyMetaData?.company_name });
        this.sendNotification(partnerAccount?.deviceToken , message , title , {})
      }

      if (partnerAccount?.webDeviceToken) {

        let targetLocale = partnerAccount?.web_locale || process.env.DEFAULT_LANGUAGE;
        let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
        let title = i18n.__({ phrase: "editTrip.notification.noShowCustomerPartnerAccountTitle", locale: targetLocale }, { company_name: companyMetaData?.company_name });
        this.sendNotification(partnerAccount?.webDeviceToken , message , title , {})
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
        
        let targetLocale = driverCompanyAccess?.app_locale || process.env.DEFAULT_LANGUAGE;
        let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
        // for refresh trip
        await io.to(driverCompanyAccess?.socketId).emit("noShow", { message , trip_data } )
      }

      // for partner web side
      if (driverCompanyAccess?.webSocketId) {

        let targetLocale = driverCompanyAccess?.web_locale || process.env.DEFAULT_LANGUAGE;
        let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
        // for refresh trip
        await io.to(driverCompanyAccess?.webSocketId).emit("noShow", { message , trip_data } )
      }

      // Informed to the company when driver didn't  find the  customer  on pickup location
      if (driverCompanyAccess?.deviceToken) {

        let targetLocale = driverCompanyAccess?.app_locale || process.env.DEFAULT_LANGUAGE;
        let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
        let title = i18n.__({ phrase: "editTrip.notification.noShowCustomerAccountAccessTitle", locale: targetLocale }, { company_name: companyMetaData?.company_name });
        this.sendNotification(driverCompanyAccess?.deviceToken , message , title  , {})
      }

      // Informed to the company when driver didn't  find the  customer  on pickup location
      if (driverCompanyAccess?.webDeviceToken) {

        let targetLocale = driverCompanyAccess?.web_locale || process.env.DEFAULT_LANGUAGE;
        let message = i18n.__({ phrase: "noShowUser.success.driverUnableToLocateCustomer", locale: targetLocale }, { trip_id: trip_data.trip_id });
        let title = i18n.__({ phrase: "editTrip.notification.noShowCustomerAccountAccessTitle", locale: targetLocale }, { company_name: companyMetaData?.company_name });
        this.sendNotification(driverCompanyAccess?.webDeviceToken , message , title  , {})
      }
    }
  }
  
}

exports.activeDriverInfo = async (driverId) => {

  // let driverDetail = await driver_model.findById(driverId).lean();
  // let driverVehicleDetail = await VEHICLE_MODEL.findById(new mongoose.Types.ObjectId(driverDetail?.defaultVehicle));
  // let planDetails = await SUBSCRIPTION_MODEL.find({
  //                                                   purchaseByDriverId: new mongoose.Types.ObjectId(driverId),
  //                                                   endPeriod: { $gte: new Date() }
  //                                                 });
  // driverDetail.defaultVehicleDetail = driverVehicleDetail;
  // driverDetail.isPlan = driverDetail?.is_special_plan_active == true || planDetails.length > 0 ? true : false;
  let getDrivers = await driver_model.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(driverId),
      },
    },
    {
      $lookup: {
        from: "vehicles",
        localField: "defaultVehicle",
        foreignField: "_id",
        as: "defaultVehicle",
      },
    },
    {
      $unwind: {
        path: "$defaultVehicle",
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: "subscriptions",
        let: { driverId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$purchaseByDriverId", "$$driverId"] },
                  { $eq: ["$paid", true] },
                  { $gt: ["$endPeriod", new Date()] }
                ]
              }
            }
          },
          { $sort: { createdAt: -1 } },  // ✅ sort subscriptions here
          { $limit: 1 }                  // ✅ only latest subscription
        ],
        as: "subscriptionData"
      }
    }
  ]);

  return getDrivers.length > 0 ? getDrivers[0] : {};
}

exports.partnerAccountRefreshTrip = async (companyId , message, io) => {

  const companyData = await user_model.findOne({ _id: companyId });

  // console.log("partner refrrsh")
  
  if (companyData?.socketId) {
    io.to(companyData?.socketId).emit("refreshTrip", { message: message } )

    // console.log("app socket---", companyData?.socketId)
  }

  if (companyData?.webSocketId) {
    
    io.to(companyData?.webSocketId).emit("refreshTrip", { message: message })
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

exports.emitTripNotAcceptedByDriver = async (socket , tripDetail , driverInfo) => {
  try {

      const user = await user_model.findById(tripDetail.created_by_company_id);
      const agency = await AGENCY_MODEL.findOne({ user_id: tripDetail.created_by_company_id, });

      let socketList = [];
      let deviceTokenList = [];

      if (user?.socketId) { socketList.push({socketId: user?.socketId , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }
      if (user?.webSocketId) { socketList.push({webSocketId: user?.webSocketId , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }
      if (user?.deviceToken) { deviceTokenList.push({ deviceToken: user?.deviceToken , platform: constant.PLATFORM.MOBILE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}
      if (user?.webDeviceToken) { deviceTokenList.push({ webDeviceToken: user?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale })}

      // get the drivers (who have access) of  partners and account access list 
      const driverList = await driver_model.find({
                                                    $and: [
                                                      {
                                                        _id: { $ne: driverInfo._id }, // 👈 Exclude this driver who get the trip so this driver will not be notified
                                                        status: true,
                                                      },
                                                      {
                                                        $or: [
                                                          {
                                                            parnter_account_access: {
                                                              $elemMatch: { company_id: user._id },
                                                            },
                                                          },
                                                          {
                                                            company_account_access: {
                                                              $elemMatch: { company_id: user._id },
                                                            },
                                                          },
                                                        ],
                                                      },
                                                    ],
                                                 });

      if (driverList) {

        for (let driver of driverList) {
          if (driver?.socketId) { socketList.push({ socketId : driver?.socketId , platform: constant.PLATFORM.MOBILE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale } ); }
          if (driver?.webSocketId) { socketList.push({webSocketId :driver?.webSocketId , platform: constant.PLATFORM.WEBSITE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale }); }
          if (driver?.deviceToken) { deviceTokenList.push({ deviceToken :driver?.deviceToken , platform: constant.PLATFORM.MOBILE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
          if (driver?.webDeviceToken) { deviceTokenList.push( { webDeviceToken : driver?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
        }
      }


      // emit the socket for notifing---- driver didn't accept the trip
      if (socketList) {
        for (let socketData of socketList) {

          if (socketData?.platform === constant.PLATFORM.MOBILE && socketData?.socketId ) {

            let socketId = socketData?.socketId;
            let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "getTrip.success.tripNotAcceptedByDriver", locale: targetLocale }, { company_name: agency.company_name });
            socket.to(socketId).emit("tripNotAcceptedBYDriver", {
                                                                  trip: tripDetail,
                                                                  message: message,
                                                                }
                                    );

            socket.to(socketId).emit("refreshTrip", {  message: "Trip not accepted by driver. Please refresh the data"  }  );
          }

          if (socketData?.platform === constant.PLATFORM.WEBSITE && socketData?.webSocketId ) {

            let webSocketId = socketData?.webSocketId;
            let targetLocale = socketData?.web_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "getTrip.success.tripNotAcceptedByDriver", locale: targetLocale }, { company_name: agency.company_name });
            socket.to(webSocketId).emit("tripNotAcceptedBYDriver", {
                                                                  trip: tripDetail,
                                                                  message: message,
                                                                }
                                    );

            socket.to(webSocketId).emit("refreshTrip", {  message: "Trip not accepted by driver. Please refresh the data"  }  );
          }
        }
      }

      // send the push notification
      if (deviceTokenList) {
        
        for (let tokenData of deviceTokenList) {

          if (tokenData?.platform === constant.PLATFORM.MOBILE && tokenData?.deviceToken ) {
          
            let tokenValue = tokenData?.deviceToken;
            let targetLocale = tokenData?.app_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.notification.tripNotAcceptedByDriverMessage", locale: targetLocale }, { trip_id: tripDetail.trip_id , driver_name: `${driverInfo?.first_name} ${driverInfo?.last_name}` });

            let title = i18n.__({ phrase: "editTrip.notification.tripNotAcceptedByDriverTitle", locale: targetLocale }, { trip_id: tripDetail.trip_id });
            

            this.sendNotification(
                                          tokenValue,
                                          message,
                                          title,
                                          driverInfo
                                        );
          }

          if (tokenData?.platform === constant.PLATFORM.WEBSITE && tokenData?.webDeviceToken ) {
          
            let tokenValue = tokenData?.webDeviceToken;
            let targetLocale = tokenData?.web_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.notification.tripNotAcceptedByDriverMessage", locale: targetLocale }, { trip_id: tripDetail.trip_id , driver_name: `${driverInfo?.first_name} ${driverInfo?.last_name}` });

            let title = i18n.__({ phrase: "editTrip.notification.tripNotAcceptedByDriverTitle", locale: targetLocale }, { trip_id: tripDetail.trip_id });
            

            this.sendNotification(
                                          tokenValue,
                                          message,
                                          title,
                                          driverInfo
                                        );
          }
        }
      }

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error send emit trip not accepted by driver error:', error.message);
  console.log('emitTripNotAcceptedByDriver-------' , error)
  }
}

// When driver raise the trip cancellatio request after accpeting the trip
exports.emitTripCancellationRequestByDriver = async(tripDetails , driverDetails , currentSocketId , socket) => {
 
  try {
    console.log('cancel request by driver------------------')
    let user = await user_model.findById(tripDetails?.created_by_company_id);
    const companyAgencyData = await AGENCY_MODEL.findOne({user_id: tripDetails.created_by_company_id})
    let driver_name = driverDetails.first_name + " " + driverDetails.last_name;

    let socketList = [];
    let deviceTokenList = [];

    // If trip company owner is not cancelling the trip from his driver
    if (currentSocketId != user?.socketId) {

      if (user?.socketId) { socketList.push({socketId: user?.socketId , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }
      if (user?.webSocketId) { socketList.push({webSocketId: user?.webSocketId , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }
      if (user?.deviceToken) { deviceTokenList.push({ deviceToken: user?.deviceToken , platform: constant.PLATFORM.MOBILE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}
      if (user?.webDeviceToken) { deviceTokenList.push({ webDeviceToken: user?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale })}
    }

    // get the drivers (who have access) of  partners and account access list 
    const driverList = await driver_model.find({
                                                  $and: [
                                                    {
                                                      socketId: { $ne: currentSocketId }, // 👈 Exclude this driver who get the trip so this driver will not be notified
                                                      status: true,
                                                    },
                                                    {
                                                      $or: [
                                                        {
                                                          parnter_account_access: {
                                                            $elemMatch: { company_id: user._id },
                                                          },
                                                        },
                                                        {
                                                          company_account_access: {
                                                            $elemMatch: { company_id: user._id },
                                                          },
                                                        },
                                                      ],
                                                    },
                                                  ],
                                                });

    if (driverList) {

      for (let driver of driverList) {
          if (driver?.socketId) { socketList.push({ socketId : driver?.socketId , platform: constant.PLATFORM.MOBILE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale } ); }
          if (driver?.webSocketId) { socketList.push({webSocketId :driver?.webSocketId , platform: constant.PLATFORM.WEBSITE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale }); }
          if (driver?.deviceToken) { deviceTokenList.push({ deviceToken :driver?.deviceToken , platform: constant.PLATFORM.MOBILE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
          if (driver?.webDeviceToken) { deviceTokenList.push( { webDeviceToken : driver?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
        }
    }

    // emit the socket for notifing---- driver canceled the trip
    if (socketList) {
      for (let socketData of socketList) {
        if (socketData?.platform === constant.PLATFORM.MOBILE && socketData?.socketId ) {

          let socketId = socketData?.socketId;
          let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;
          let message = i18n.__({ phrase: "editTrip.socket.tripCancellationRequestByDriver", locale: targetLocale }, { driver_name: driver_name  , trip_id: tripDetails?.trip_id});
          socket.to(socketId).emit("tripCancellationRequestByDriver", {
                                                              trip: tripDetails,
                                                              driver: driverDetails,
                                                              message: message,
                                                            },
                                  );
          
        }

        if (socketData?.platform === constant.PLATFORM.WEBSITE && socketData?.webSocketId ) {

          let webSocketId = socketData?.webSocketId;
          let targetLocale = socketData?.web_locale || process.env.DEFAULT_LANGUAGE;
          let message = i18n.__({ phrase: "editTrip.socket.tripCancellationRequestByDriver", locale: targetLocale }, { driver_name: driver_name  , trip_id: tripDetails.trip_id});
          socket.to(webSocketId).emit("tripCancellationRequestByDriver", {
                                                              trip: tripDetails,
                                                              driver: driverDetails,
                                                              message: message,
                                                            },
                                  );
          
        }
      }
    }

    // send the push notification
    if (deviceTokenList) {
      
      for (let tokenData of deviceTokenList) {

        if (tokenData?.platform === constant.PLATFORM.MOBILE && tokenData?.deviceToken ) {
          
          let tokenValue = tokenData?.deviceToken;
          let targetLocale = tokenData?.app_locale || process.env.DEFAULT_LANGUAGE;
          let message = i18n.__({ phrase: "editTrip.notification.tripCancellationRequestByDriverMessage", locale: targetLocale }, { driver_name: driver_name , trip_id: tripDetails.trip_id });

          let title = i18n.__({ phrase: "editTrip.notification.tripCancellationRequestByDriverTitle", locale: targetLocale }, { trip_id: tripDetails.trip_id });
          this.sendNotification(
                                  tokenValue,
                                  message,
                                  title,
                                  driverDetails 
                                );
        }

        if (tokenData?.platform === constant.PLATFORM.WEBSITE && tokenData?.webDeviceToken ) {
          
          let tokenValue = tokenData?.webDeviceToken;
          let targetLocale = tokenData?.web_locale || process.env.DEFAULT_LANGUAGE;
          let message = i18n.__({ phrase: "editTrip.notification.tripCancellationRequestByDriverMessage", locale: targetLocale }, { driver_name: driver_name , trip_id: tripDetails.trip_id });

          let title = i18n.__({ phrase: "editTrip.notification.tripCancellationRequestByDriverTitle", locale: targetLocale }, { trip_id: tripDetails.trip_id });
          this.sendNotification(
                                  tokenValue,
                                  message,
                                  title,
                                  driverDetails 
                                );
        }
      }
    }

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error  emit trip cancellation request by driver:', error.message);
    
  }
}

exports.emitTripCancelledByDriver = async(tripDetails , driverDetails , currentSocketId , socket) => {
 
  try {
    console.log('cancel by driver------------------')
    let user = await user_model.findById(tripDetails?.created_by_company_id);
    const companyAgencyData = await AGENCY_MODEL.findOne({user_id: tripDetails.created_by_company_id})
    let driver_name = driverDetails.first_name + " " + driverDetails.last_name;

    let socketList = [];
    let deviceTokenList = [];

    // If trip company owner is not cancelling the trip from his driver
    if (currentSocketId != user?.socketId) {

      if (user?.socketId) { socketList.push({socketId: user?.socketId , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }
      if (user?.webSocketId) { socketList.push({webSocketId: user?.webSocketId , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }
      if (user?.deviceToken) { deviceTokenList.push({ deviceToken: user?.deviceToken , platform: constant.PLATFORM.MOBILE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}
      if (user?.webDeviceToken) { deviceTokenList.push({ webDeviceToken: user?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale })}
    }

    console.log("---------")
        console.log("---")
        console.log("----")
        console.log("---canel trip by driver")
        console.log("------")
        
        console.log("tripCancellationRequestDecision: sending to socket:", user?.webSocketId , '---' , user.email);
        console.log("Current sockets on this process:", Array.from(socket.sockets.sockets.keys()));
        
        console.log("------")
        console.log("------")
        console.log("------")
        console.log("------")
        console.log("---------")
    // get the drivers (who have access) of  partners and account access list 
    const driverList = await driver_model.find({
                                                  $and: [
                                                    {
                                                      socketId: { $ne: currentSocketId }, // 👈 Exclude this driver who get the trip so this driver will not be notified
                                                      status: true,
                                                    },
                                                    {
                                                      $or: [
                                                        {
                                                          parnter_account_access: {
                                                            $elemMatch: { company_id: user._id },
                                                          },
                                                        },
                                                        {
                                                          company_account_access: {
                                                            $elemMatch: { company_id: user._id },
                                                          },
                                                        },
                                                      ],
                                                    },
                                                  ],
                                                });

    if (driverList) {

      for (let driver of driverList) {
          if (driver?.socketId) { socketList.push({ socketId : driver?.socketId , platform: constant.PLATFORM.MOBILE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale } ); }
          if (driver?.webSocketId) { socketList.push({webSocketId :driver?.webSocketId , platform: constant.PLATFORM.WEBSITE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale }); }
          if (driver?.deviceToken) { deviceTokenList.push({ deviceToken :driver?.deviceToken , platform: constant.PLATFORM.MOBILE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
          if (driver?.webDeviceToken) { deviceTokenList.push( { webDeviceToken : driver?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
        }
    }

    // emit the socket for notifing---- driver canceled the trip
    if (socketList) {
      for (let socketData of socketList) {
        if (socketData?.platform === constant.PLATFORM.MOBILE && socketData?.socketId ) {

          let socketId = socketData?.socketId;
          let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;
          let message = i18n.__({ phrase: "editTrip.socket.tripCancelledByDriver", locale: targetLocale }, { driver_name: driver_name });
          socket.to(socketId).emit("tripCancelledBYDriver", {
                                                              trip: tripDetails,
                                                              driver: driverDetails,
                                                              message: message,
                                                            },
                                  );
          socket.to(socketId).emit("refreshTrip", {  message: "The trip driver did not accept the trip. Please refresh the data to see the latest updates"  }  );
        }

        if (socketData?.platform === constant.PLATFORM.WEBSITE && socketData?.webSocketId ) {

          let webSocketId = socketData?.webSocketId;
          let targetLocale = socketData?.web_locale || process.env.DEFAULT_LANGUAGE;
          let message = i18n.__({ phrase: "editTrip.socket.tripCancelledByDriver", locale: targetLocale }, { driver_name: driver_name });
          socket.to(webSocketId).emit("tripCancelledBYDriver", {
                                                              trip: tripDetails,
                                                              driver: driverDetails,
                                                              message: message,
                                                            },
                                  );
          socket.to(webSocketId).emit("refreshTrip", {  message: "The trip driver did not accept the trip. Please refresh the data to see the latest updates"  }  );
        }
      }
    }

    // send the push notification
    if (deviceTokenList) {
      
      for (let tokenData of deviceTokenList) {

        if (tokenData?.platform === constant.PLATFORM.MOBILE && tokenData?.deviceToken ) {
          
          let tokenValue = tokenData?.deviceToken;
          let targetLocale = tokenData?.app_locale || process.env.DEFAULT_LANGUAGE;
          let message = i18n.__({ phrase: "editTrip.notification.tripCancelledByDriverMessage", locale: targetLocale }, { driver_name: driver_name , trip_id: tripDetails.trip_id });

          let title = i18n.__({ phrase: "editTrip.notification.tripCancelledByDriverTitle", locale: targetLocale }, { driver_name: driver_name , trip_id: tripDetails.trip_id });
          this.sendNotification(
                                  tokenValue,
                                  message,
                                  title,
                                  driverDetails 
                                );
        }

        if (tokenData?.platform === constant.PLATFORM.WEBSITE && tokenData?.webDeviceToken ) {
          
          let tokenValue = tokenData?.webDeviceToken;
          let targetLocale = tokenData?.web_locale || process.env.DEFAULT_LANGUAGE;
          let message = i18n.__({ phrase: "editTrip.notification.tripCancelledByDriverMessage", locale: targetLocale }, { driver_name: driver_name , trip_id: tripDetails.trip_id });

          let title = i18n.__({ phrase: "editTrip.notification.tripCancelledByDriverTitle", locale: targetLocale }, { driver_name: driver_name , trip_id: tripDetails.trip_id });
          this.sendNotification(
                                  tokenValue,
                                  message,
                                  title,
                                  driverDetails 
                                );
        }
      }
    }

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error emitTripCancelledByDriver:', error.message);
  }
}

exports.emitTripRetrivedByCompany = async(tripDetails , driverDetails , currentSocketId , socket) => {
 
  try {
    const user = await user_model.findOne({ _id: tripDetails?.created_by_company_id, });
    const company_data = await AGENCY_MODEL.findOne({ user_id: tripDetails?.created_by_company_id, });
    
    let socketList = [];
    let deviceTokenList = [];

    // If trip company owner is not cancelling the trip from his driver
    if (currentSocketId != driverDetails?.socketId) { // driver will notify in this sction
      
      if (driverDetails?.socketId) { socketList.push({ socketId: driverDetails?.socketId , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }

      if (driverDetails?.webSocketId) { socketList.push({webSocketId: driverDetails?.webSocketId , platform: constant.PLATFORM.WEBSITE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }

      if (driverDetails?.deviceToken) { deviceTokenList.push({deviceToken: driverDetails?.deviceToken , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}

      if (driverDetails?.webDeviceToken) { deviceTokenList.push({webDeviceToken: driverDetails?.webDeviceToken , platform: constant.WEBSITE.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}

      // Only driver will notify with pop-up functionality
      if (socketList) {
        for (let socketData of socketList) {

          if (socketData?.platform === constant.PLATFORM.MOBILE && socketData?.socketId ) {

            let socketId = socketData?.socketId;
            let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.socket.tripRetrivedByCompanyMessage", locale: targetLocale }, { company_name: company_data?.company_name });
            socket.to(socketId).emit("retrivedTrip" , {
                                                        message: message,
                                                        trip: { result:  tripDetails, }
                                                      }
                                    );
            socket.to(socketId).emit("refreshTrip", { message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates", } )
          }
        }
      }
    }
  
    // main owner of the Trip will be notified
    if (currentSocketId != user?.socketId && currentSocketId != user?.webSocketId) { // if trip owner  didn't retrive the trip then he will be notify

      if (user?.socketId) { socketList.push({socketId: user?.socketId , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }

      if (user?.webSocketId) { socketList.push({webSocketId: user?.webSocketId , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }

      if (user?.deviceToken) { deviceTokenList.push({ deviceToken: user?.deviceToken , platform: constant.PLATFORM.MOBILE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}
      
      if (user?.webDeviceToken) { deviceTokenList.push({ webDeviceToken: user?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale })}
    }

    // get the drivers (who have access) of  partners and account access list 
    const driverList = await driver_model.find({
                                                  $and: [
                                                    {
                                                      socketId: { $ne: currentSocketId }, // 👈 Exclude this driver who get the trip so this driver will not be notified
                                                      status: true,
                                                    },
                                                    {
                                                      $or: [
                                                        {
                                                          parnter_account_access: {
                                                            $elemMatch: { company_id: user._id },
                                                          },
                                                        },
                                                        {
                                                          company_account_access: {
                                                            $elemMatch: { company_id: user._id },
                                                          },
                                                        },
                                                      ],
                                                    },
                                                  ],
                                                });

    if (driverList) {

      for (let driver of driverList) {
        if (driver?.socketId) { socketList.push({ socketId : driver?.socketId , platform: constant.PLATFORM.MOBILE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale } ); }
        if (driver?.webSocketId) { socketList.push({webSocketId :driver?.webSocketId , platform: constant.PLATFORM.WEBSITE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale }); }
        if (driver?.deviceToken) { deviceTokenList.push({ deviceToken :driver?.deviceToken , platform: constant.PLATFORM.MOBILE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
        if (driver?.webDeviceToken) { deviceTokenList.push( { webDeviceToken : driver?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
      }
    }

    // emit the socket for notifing---- driver canceled the trip
    if (socketList) {
      for (let socketData of socketList) {
        if (socketData?.platform === constant.PLATFORM.MOBILE && socketData?.socketId ) {

          let socketId = socketData?.socketId;
          let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;

          socket.to(socketId).emit("refreshTrip", {  message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates"  }  );
        }

        if (socketData?.platform === constant.PLATFORM.WEBSITE && socketData?.webSocketId ) {

          let webSocketId = socketData?.webSocketId;
          let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;
          
          socket.to(webSocketId).emit("refreshTrip", {  message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates"  }  );
        }
      }
    }

    // send the push notification
    if (deviceTokenList) {
      
      for (let tokenData of deviceTokenList) {
        
        if (tokenData?.platform === constant.PLATFORM.MOBILE && tokenData?.deviceToken ) {
          
          let tokenValue = tokenData?.deviceToken;
          let targetLocale = tokenData?.app_locale || process.env.DEFAULT_LANGUAGE;

          let message = i18n.__({ phrase: "editTrip.notification.tripRetrivedMessage", locale: targetLocale }, { trip_id: tripDetails.trip_id , company_name: company_data?.company_name });

          let title = i18n.__({ phrase: "editTrip.notification.tripRetrivedTitle", locale: targetLocale }, { trip_id: tripDetails.trip_id });
          
          this.sendNotification(
                                  tokenValue,
                                  message,
                                  title,
                                  driverDetails 
                                );
        }

        if (tokenData?.platform === constant.PLATFORM.WEBSITE && tokenData?.webDeviceToken ) {
          
          let webDeviceToken = tokenData?.webDeviceToken;
          let targetLocale = tokenData?.web_locale || process.env.DEFAULT_LANGUAGE;

          let message = i18n.__({ phrase: "editTrip.notification.tripRetrivedMessage", locale: targetLocale }, { trip_id: tripDetails.trip_id , company_name: company_data?.company_name });

          let title = i18n.__({ phrase: "editTrip.notification.tripRetrivedTitle", locale: targetLocale }, { trip_id: tripDetails.trip_id });
          
          this.sendNotification(
                                  webDeviceToken,
                                  message,
                                  title,
                                  driverDetails 
                                );
        }
      }
    }

  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error emitTripretrivedBy company:', error.message);

  }
}

exports.emitTripAcceptedByDriver = async(tripDetail , driverDetails , currentSocketId , socket) => {
 
  try {

      const user = await user_model.findById(tripDetail.created_by_company_id);
      // const agency = await AGENCY_MODEL.findOne({ user_id: tripDetail.created_by_company_id, });
      let driver_name = driverDetails.first_name + " " + driverDetails.last_name;
      let socketList = [];
      let deviceTokenList = [];

      if (user?.socketId) { socketList.push({socketId: user?.socketId , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }
      if (user?.webSocketId) { socketList.push({webSocketId: user?.webSocketId , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }
      if (user?.deviceToken) { deviceTokenList.push({ deviceToken: user?.deviceToken , platform: constant.PLATFORM.MOBILE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}
      if (user?.webDeviceToken) { deviceTokenList.push({ webDeviceToken: user?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale })}

      // get the drivers (who have access) of  partners and account access list 
      const driverList = await driver_model.find({
                                                    $and: [
                                                      {
                                                       socketId: { $ne: currentSocketId }, // 👈 Exclude this driver who get the trip so this driver will not be notified
                                                        status: true,
                                                      },
                                                      {
                                                        $or: [
                                                          {
                                                            parnter_account_access: {
                                                              $elemMatch: { company_id: user._id },
                                                            },
                                                          },
                                                          {
                                                            company_account_access: {
                                                              $elemMatch: { company_id: user._id },
                                                            },
                                                          },
                                                        ],
                                                      },
                                                    ],
                                                 });

      if (driverList) {

        for (let driver of driverList) {
          if (driver?.socketId) { socketList.push({ socketId : driver?.socketId , platform: constant.PLATFORM.MOBILE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale } ); }
          if (driver?.webSocketId) { socketList.push({webSocketId :driver?.webSocketId , platform: constant.PLATFORM.WEBSITE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale }); }
          if (driver?.deviceToken) { deviceTokenList.push({ deviceToken :driver?.deviceToken , platform: constant.PLATFORM.MOBILE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
          if (driver?.webDeviceToken) { deviceTokenList.push( { webDeviceToken : driver?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
        }
      }

      // emit the socket for notifing---- driver didn't accept the trip
      if (socketList) {
        for (let socketData of socketList) {

           if (socketData?.platform === constant.PLATFORM.MOBILE && socketData?.socketId ) {

            let socketId = socketData?.socketId;
            let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.socket.tripAcceptedByDriver", locale: targetLocale });
            socket.to(socketId).emit("tripAcceptedBYDriver", {
                                                                  trip: tripDetail,
                                                                  message: message,
                                                                }
                                    );

            socket.to(socketId).emit("refreshTrip", {  message: `The driver has accepted the trip. Please refresh the data to view the latest updates`  }  );
          }

          if (socketData?.platform === constant.PLATFORM.WEBSITE && socketData?.webSocketId ) {

            let webSocketId = socketData?.webSocketId;
            let targetLocale = socketData?.web_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.socket.tripAcceptedByDriver", locale: targetLocale });
            socket.to(webSocketId).emit("tripAcceptedBYDriver", {
                                                                  trip: tripDetail,
                                                                  message: message,
                                                                }
                                    );

            socket.to(webSocketId).emit("refreshTrip", {  message: `The driver has accepted the trip. Please refresh the data to view the latest updates`  }  );
          }
        }
      }

      // send the push notification
      if (deviceTokenList) {
        
        for (let tokenData of deviceTokenList) {

          if (tokenData?.platform === constant.PLATFORM.MOBILE && tokenData?.deviceToken ) {
            
            let tokenValue = tokenData?.deviceToken;
            let targetLocale = tokenData?.app_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.notification.tripAcceptedByDriverMessage", locale: targetLocale }, { trip_id: tripDetail.trip_id , driver_name: driver_name });

            let title = i18n.__({ phrase: "editTrip.notification.tripAcceptedByDriverTitle", locale: targetLocale }, { trip_id: tripDetail.trip_id });

            this.sendNotification(
                                    tokenValue,
                                    message,
                                    title,
                                    driverDetails
                                  );
          }

          if (tokenData?.platform === constant.PLATFORM.WEBSITE && tokenData?.webDeviceToken ) {
            
            let tokenValue = tokenData?.webDeviceToken;
            let targetLocale = tokenData?.web_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.notification.tripAcceptedByDriverMessage", locale: targetLocale }, { trip_id: tripDetail.trip_id , driver_name: driver_name });

            let title = i18n.__({ phrase: "editTrip.notification.tripAcceptedByDriverTitle", locale: targetLocale }, { trip_id: tripDetail.trip_id });

            this.sendNotification(
                                    tokenValue,
                                    message,
                                    title,
                                    driverDetails
                                  );
          }

        }
      }

      if (tripDetail?.customerDetails?.email) {
        // this.sendBookingUpdateDriverAllocationEmail(tripDetail)
      }

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error emitTripAcceptedBydriver:', error.message);
  }
}

exports.emitTripAssignedToSelf = async(tripDetail , isPartnerAccess , driverDetails , socket , isPartiallyAccess) => {
 
  try {

      const user = await user_model.findById(tripDetail.created_by_company_id);
      // const agency = await AGENCY_MODEL.findOne({ user_id: tripDetail.created_by_company_id, });
      let driver_name = driverDetails.first_name + " " + driverDetails.last_name;
      let socketList = [];
      let deviceTokenList = [];

      // When trip owner will not assign the trip to his own driver account
      if (isPartnerAccess || isPartiallyAccess) { // when partner account will assign the trip to his own driver account ot partiall account driver will adign the trip
        if (user?.socketId) { socketList.push({socketId: user?.socketId , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }

        if (user?.webSocketId) { socketList.push({webSocketId: user?.webSocketId , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }

        if (user?.deviceToken) { deviceTokenList.push({ deviceToken: user?.deviceToken , platform: constant.PLATFORM.MOBILE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}
        
        if (user?.webDeviceToken) { deviceTokenList.push({ webDeviceToken: user?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale })}
      }
      
      // get the drivers (who have access) of  partners account access and partialluy account access list 
      const driverList = await driver_model.find({
                                                    $and: [
                                                      {
                                                       ...(!isPartiallyAccess ? {_id: { $ne: driverDetails._id }} : {}), // 👈 Exclude this driver who get the trip so this driver will not be notified
                                                        status: true,
                                                      },
                                                      {
                                                        $or: [
                                                          {
                                                            parnter_account_access: {
                                                              $elemMatch: { company_id: user._id },
                                                            },
                                                          },
                                                          {
                                                            company_account_access: {
                                                              $elemMatch: { company_id: user._id },
                                                            },
                                                          },
                                                        ],
                                                      },
                                                    ],
                                                 });

      if (driverList) {

        for (let driver of driverList) {
          if (driver?.socketId) { socketList.push({ socketId : driver?.socketId , platform: constant.PLATFORM.MOBILE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale } ); }

          if (driver?.webSocketId) { socketList.push({webSocketId :driver?.webSocketId , platform: constant.PLATFORM.WEBSITE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale }); }

          if (driver?.deviceToken) { deviceTokenList.push({ deviceToken :driver?.deviceToken , platform: constant.PLATFORM.MOBILE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}

          if (driver?.webDeviceToken) { deviceTokenList.push( { webDeviceToken : driver?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
        }
      }

      // emit the socket for notifing---- driver didn't accept the trip
      if (socketList) {
        for (let socketData of socketList) {

          if (socketData?.platform === constant.PLATFORM.MOBILE && socketData?.socketId ) {
            
            let socketId = socketData?.socketId;
            let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;
            // socket.to(socketId).emit("tripAcceptedBYDriver", {
            //                                                       trip: tripDetail,
            //                                                       message: `Trip accepted successfully`,
            //                                                     }
            //                         );

            socket.to(socketId).emit("refreshTrip", {  message: `The trip driver has accepted the trip. Please refresh the data to view the latest updates`  }  );
          }

          if (socketData?.platform === constant.PLATFORM.WEBSITE && socketData?.webSocketId ) {
            
            let webSocketId = socketData?.webSocketId;
            let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;
            // socket.to(socketId).emit("tripAcceptedBYDriver", {
            //                                                       trip: tripDetail,
            //                                                       message: `Trip accepted successfully`,
            //                                                     }
            //                         );

            socket.to(webSocketId).emit("refreshTrip", {  message: `The trip driver has accepted the trip. Please refresh the data to view the latest updates`  }  );
          }
        }
      }

      // send the push notification
      if (deviceTokenList) {
        
        for (let tokenData of deviceTokenList) {

          if (tokenData?.platform === constant.PLATFORM.MOBILE && tokenData?.deviceToken ) {
            let tokenValue = tokenData?.deviceToken;
            let targetLocale = tokenData?.app_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.notification.tripSelfAssignedMessage", locale: targetLocale }, { driver_name: driver_name , trip_id: tripDetail.trip_id });

            let title = i18n.__({ phrase: "editTrip.notification.tripSelfAssignedTitle", locale: targetLocale }, { trip_id: tripDetail.trip_id });
            this.sendNotification(
                                    tokenValue,
                                    message,
                                    title,
                                    driverDetails
                                  );
          }

          if (tokenData?.platform === constant.PLATFORM.WEBSITE && tokenData?.webDeviceToken ) {
            let tokenValue = tokenData?.webDeviceToken;
            let targetLocale = tokenData?.app_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.notification.tripSelfAssignedMessage", locale: targetLocale }, { driver_name: driver_name , trip_id: tripDetail.trip_id });

            let title = i18n.__({ phrase: "editTrip.notification.tripSelfAssignedTitle", locale: targetLocale }, { trip_id: tripDetail.trip_id });
            this.sendNotification(
                                    tokenValue,
                                    message,
                                    title,
                                    driverDetails
                                  );
          }
        }
      }

      if (tripDetail?.customerDetails?.email) {
        // this.sendBookingConfirmationEmail(tripDetail);
      }

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error emitTripassigned to self:', error.message);
  }
}

exports.emitNewTripAddedByCustomer = async(tripDetail , socket) => {
 
  try {

      const user = await user_model.findById(tripDetail.created_by_company_id);
      const agency = await AGENCY_MODEL.findOne({ user_id: tripDetail.created_by_company_id, });
      
      let socketList = [];
      let deviceTokenList = [];
      

      if (user?.socketId) { socketList.push({socketId: user?.socketId , platform: constant.PLATFORM.MOBILE, email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }

      if (user?.webSocketId) { socketList.push({webSocketId: user?.webSocketId , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale}); }

      if (user?.deviceToken) { deviceTokenList.push({ deviceToken: user?.deviceToken , platform: constant.PLATFORM.MOBILE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale})}

      if (user?.webDeviceToken) { deviceTokenList.push({ webDeviceToken: user?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: user?.email , app_locale: user?.app_locale , web_locale: user?.web_locale })}
      

      // get the drivers (who have access) of  partners and account access list 
      const driverList = await driver_model.find({
                                                    $and: [
                                                      {
                                                       status: true,
                                                      },
                                                      {
                                                        $or: [
                                                          {
                                                            parnter_account_access: {
                                                              $elemMatch: { company_id: user._id },
                                                            },
                                                          },
                                                          {
                                                            company_account_access: {
                                                              $elemMatch: { company_id: user._id },
                                                            },
                                                          },
                                                        ],
                                                      },
                                                    ],
                                                 });

      if (driverList) {

        for (let driver of driverList) {
          if (driver?.socketId) { socketList.push({ socketId : driver?.socketId , platform: constant.PLATFORM.MOBILE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale } ); }

          if (driver?.webSocketId) { socketList.push({webSocketId :driver?.webSocketId , platform: constant.PLATFORM.WEBSITE ,email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale }); }

          if (driver?.deviceToken) { deviceTokenList.push({ deviceToken :driver?.deviceToken , platform: constant.PLATFORM.MOBILE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}

          if (driver?.webDeviceToken) { deviceTokenList.push( { webDeviceToken : driver?.webDeviceToken , platform: constant.PLATFORM.WEBSITE , email: driver?.email , app_locale: driver?.app_locale , web_locale: driver?.web_locale })}
        }
      }

      // emit the socket for notifing---- driver didn't accept the trip
      if (socketList) {
        for (let socketData of socketList) {

          if (socketData?.platform === constant.PLATFORM.MOBILE && socketData?.socketId ) {

            let socketId = socketData?.socketId;
            let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;

            // socket.to(socketId).emit("tripAcceptedBYDriver", {
            //                                                       trip: tripDetail,
            //                                                       message: `Trip accepted successfully`,
            //                                                     }
            //                         );

            socket.to(socketId).emit("refreshTrip", {  message: `New trip added by customer. Please refresh the data to view the latest updates`  }  );
          }

          if (socketData?.platform === constant.PLATFORM.WEBSITE && socketData?.webSocketId ) {

            let socketId = socketData?.webSocketId;
            let targetLocale = socketData?.app_locale || process.env.DEFAULT_LANGUAGE;

            // socket.to(socketId).emit("tripAcceptedBYDriver", {
            //                                                       trip: tripDetail,
            //                                                       message: `Trip accepted successfully`,
            //                                                     }
            //                         );

            socket.to(socketId).emit("refreshTrip", {  message: `New trip added by customer. Please refresh the data to view the latest updates`  }  );
          }
        }
      }

      // send the push notification
      if (deviceTokenList) {
        
        for (let tokenData of deviceTokenList) {

          if (tokenData?.platform === constant.PLATFORM.MOBILE && tokenData?.deviceToken ) {
          
            let tokenValue = tokenData?.deviceToken;
            let targetLocale = tokenData?.app_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.notification.tripAddedByCustomerMessage", locale: targetLocale }, { trip_id: tripDetail.trip_id , company_name: agency?.company_name});

            let title = i18n.__({ phrase: "editTrip.notification.tripAddedByCustomerTitle", locale: targetLocale }, { trip_id: tripDetail.trip_id });
            this.sendNotification(
                                    tokenValue,
                                    message,
                                    title,
                                    tripDetail
                                  );
          }

          if (tokenData?.platform === constant.PLATFORM.WEBSITE && tokenData?.webDeviceToken ) {
          
            let tokenValue = tokenData?.webDeviceToken;
            let targetLocale = tokenData?.web_locale || process.env.DEFAULT_LANGUAGE;
            let message = i18n.__({ phrase: "editTrip.notification.tripAddedByCustomerMessage", locale: targetLocale }, { trip_id: tripDetail.trip_id , company_name: agency?.company_name});

            let title = i18n.__({ phrase: "editTrip.notification.tripAddedByCustomerTitle", locale: targetLocale }, { trip_id: tripDetail.trip_id });
            this.sendNotification(
                                    tokenValue,
                                    message,
                                    title,
                                    tripDetail
                                  );
          }
        }
      }

      if (tripDetail?.customerDetails?.email) {
        this.sendBookingConfirmationEmail(tripDetail);
      }

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error emitNew trip added by customer:', error.message);
  }
}

exports.sendNotification = async (to, message, title, data = {notificationType: constant.NOTIFICATION_TYPE.OTHER}) => {
  let device_token = to;
  

  try {
    const messageData = {
      token: to, // The device token to send the message to
      notification: {
        title: title, // Notification title
        body: message, // Notification body
      },
      android: {
        priority: "high",
        notification: {
          // sound: "default", // Play default notification sound on Android
          sound: data?.notificationType == constant.NOTIFICATION_TYPE.ALLOCATE_TRIP ?  `car_horn` : `ping`, // Play default notification sound on Android
          channel_id: data?.notificationType == constant.NOTIFICATION_TYPE.ALLOCATE_TRIP ? `trip_request_channel` : `ping_sound_channel`
        },
      },
      apns: {
        payload: {
          aps: {
            // sound: "default", // Play default notification sound on iOS
            sound: data?.notificationType == constant.NOTIFICATION_TYPE.ALLOCATE_TRIP ? `car_horn.wav` : `ping.wav`,
          },
        },
      },
      webpush: {
        notification: {
          icon: `${process.env.FRONTEND_URL}/icons/icon-192x192.png`,
          click_action: `${process.env.FRONTEND_URL}`,
          sound: data?.notificationType == constant.NOTIFICATION_TYPE.ALLOCATE_TRIP
            ? "/sounds/car_horn.mp3"
            : "/sounds/ping.mp3"
        },
        headers: {
          Urgency: `high`
        }
      }
    };

    
    const response = await admin.messaging().send(messageData);

    return response;
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error esend notification:', error.message);
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

exports.getCityAndCountry = async (address) => {
  
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAP_KEY}`;
  try {
    const response = await axios.get(url);
    const results = response.data.results;

    if (results.length === 0) {
      return { city: null, country: null };
    }

    const components = results[0].address_components;

    let city = null;
    let country = null;

    for (const comp of components) {
      if (comp.types.includes('locality')) {
        city = comp.long_name;
      }
      if (comp.types.includes('country')) {
        country = comp.long_name;
      }
    }

    return { city, country };

  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error get city and country:', error.message);
    console.error('Error fetching location:', error.message);
    return { city: null, country: null };
  }
};


exports.sendPaymentFailEmail = async (subsctiptionId , reseon) => {

  
  let subscriptionDetails = await SUBSCRIPTION_MODEL.findOne({subscriptionId: subsctiptionId}).populate('purchaseByCompanyId').populate('purchaseByDriverId');
  if (!subscriptionDetails) {
    console.error(`❌ No subscription found for ID: ${subsctiptionId}`);
    return { error: "Subscription not found" };
  }
  let toEmail = subscriptionDetails.role == CONSTANT.ROLES.COMPANY ? subscriptionDetails?.purchaseByCompanyId?.email : subscriptionDetails?.purchaseByDriverId?.email;
  let UserName = subscriptionDetails.role == CONSTANT.ROLES.COMPANY ? `${subscriptionDetails?.purchaseByCompanyId?.first_name } ${subscriptionDetails?.purchaseByCompanyId?.last_name}` : `${subscriptionDetails?.purchaseByDriverId?.first_name } ${subscriptionDetails?.purchaseByDriverId?.last_name}`;

  let reseonName = reseon === CONSTANT.SUBSCRIPTION_CANCEL_REASON.USER_CANCEL ? `Cancelled by you` : reseon.replace(/_/g, ' ');

  const currentDate = new Date();

  // Get day, month, and year
  const day = String(currentDate.getDate()).padStart(2, '0'); // Add leading zero if needed
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are 0-based, add 1 and pad
  const year = String(currentDate.getFullYear()); // Get last two digits of the year

  // Format date as dd mm yy
  const formattedDate = `${day}-${month}-${year}`;

  var transporter = nodemailer.createTransport(emailConstant.credentials);
  let subject = ``;
  if (reseon === CONSTANT.SUBSCRIPTION_CANCEL_REASON.CARD_DECLINED) {

    subject = `Action Required: Payment Declined for Your Subscription`;
  } else if (reseon === CONSTANT.SUBSCRIPTION_CANCEL_REASON.INSUFFUCIENT_FUNDS) {
    console.log('INSUFFUCIENT_FUNDS-------')
    subject = `Action Required: Your Subscription Payment Declined (Insufficient Funds)`;
  } else if (reseon === CONSTANT.SUBSCRIPTION_CANCEL_REASON.EXPIRED_CARD) {

    subject = `Action Required: Your Subscription Payment Declined (Expired Card)`;
  } else if (reseon === CONSTANT.SUBSCRIPTION_CANCEL_REASON.EXPIRED_CARD) {

    subject = `Action Required: Your Subscription Payment Declined (Card Blocked)`;
  } else if (reseon === CONSTANT.SUBSCRIPTION_CANCEL_REASON.PROCESSING_ERROR) {

    subject = `Action Required: Your Subscription Payment Declined (Processing Error)`;
  } else if (reseon === CONSTANT.SUBSCRIPTION_CANCEL_REASON.PROCESSING_ERROR) {

    subject = `Action Required: Your Subscription Payment Declined (Unknown Error)`;
  } else if (reseon === CONSTANT.SUBSCRIPTION_CANCEL_REASON.USER_CANCEL) {

    subject = `Action Required: Your Subscription Cancellation`;
  }

  const bodyHtml = `<center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                            <td class="" style="color:#444; font-weight: 400;"><br>
                            Dear ${UserName}
                            <br>
                            <br>
                              I hope this message finds you well. We are writing to inform you that your subscription has been canceled due to a ${reseonName}. Unfortunately, we were unable to process your recent payment, which has resulted in the immediate cancellation of your subscription.
                             
                            <br>
                            <br>
                            <span style="font-weight:bold;">Details of the Transaction:</span> 
                            <br>
                              <ul>
                                <li>
                                  <span style="font-weight:bold;">Subscription ID: </span> ${subscriptionDetails.subscriptionId}
                                </li>
                                <li>
                                  <span style="font-weight:bold;">Attempted Amount: </span> €${subscriptionDetails.amount.toFixed(2)}
                                </li>
                                <li>
                                  <span style="font-weight:bold;">Date of Attempt: </span>  ${formattedDate}
                                </li>
                              </ul>
                            <br><br>  
                            <span>
                              To reactivate your plan and continue enjoying our services, we invite you to purchase a new subscription. You can easily do this by logging into your account on our App or website and selecting the subscription plan that best suits your needs.
                            </span>
                            <br><br>
                            <span>
                              If you have any questions or require assistance during this process, please do not hesitate to reach out to our support team at  <a href="mailto: ${process.env.SUPPORT_EMAIL}"> ${process.env.SUPPORT_EMAIL}</a>. We are here to help!
                            </span>
                            <br><br>

                            <span>
                              Thank you for your understanding, and we look forward to welcoming you back soon.
                            </span>
                            <br><br>`;

  let template = ` ${bodyHtml}`
 
  var mailOptions = {
                      from: emailConstant.from_email,
                      to: toEmail,
                      subject: subject,
                      html: template
                    };
  await transporter.sendMail(mailOptions);
  return {reseon , subject}

}

exports.sendEmailSubscribeSubcription = async (subsctiptionId) => {

  let subscriptionDetails = await SUBSCRIPTION_MODEL.findOne({subscriptionId: subsctiptionId}).populate('purchaseByCompanyId').populate('purchaseByDriverId');
  const planDetails = await PLANS_MODEL.findOne({planId:subscriptionDetails?.planId });
  let toEmail = subscriptionDetails.role == CONSTANT.ROLES.COMPANY ? subscriptionDetails?.purchaseByCompanyId?.email : subscriptionDetails?.purchaseByDriverId?.email;
 
  let UserName = subscriptionDetails.role == CONSTANT.ROLES.COMPANY ? `${subscriptionDetails?.purchaseByCompanyId?.first_name } ${subscriptionDetails?.purchaseByCompanyId?.last_name}` : `${subscriptionDetails?.purchaseByDriverId?.first_name } ${subscriptionDetails?.purchaseByDriverId?.last_name}`;


  const subject = `Welcome to ${UserName} – Subscription Activated`
 
  
  let subscriptionData = {
                          userName: UserName,
                          planName: planDetails.name, 
                          subsctiptionId: subsctiptionId,
                          startPeriod: subscriptionDetails.startPeriod,
                          endPeriod: subscriptionDetails.endPeriod,
                          amount: subscriptionDetails.amount.toFixed(2),
                        }

  const attachments = [
                        {
                            filename: `${subscriptionDetails.invoiceName}.pdf`,  // Change filename as needed
                            url: `${subscriptionDetails.invoicePdfUrl}`,  // Provide the correct path to the file
                            mimetype: 'application/pdf' // Set appropriate content type
                        }
                      ]
  const emailSent = await sendEmail(
                                        toEmail, // Receiver email
                                        subject, // Subject
                                        "subscription-activated", // Template name (without .ejs extension)
                                        subscriptionData,
                                        'en', //  for lanuguage
                                        attachments // for attachment
                                      )
  return emailSent
}

exports.sendEmailCancelledSubcription = async (subsctiptionId) => {

  let subscriptionDetails = await SUBSCRIPTION_MODEL.findOne({subscriptionId: subsctiptionId}).populate('purchaseByCompanyId').populate('purchaseByDriverId');
  const planDetails = await PLANS_MODEL.findOne({planId:subscriptionDetails?.planId });
  let toEmail = subscriptionDetails.role == CONSTANT.ROLES.COMPANY ? subscriptionDetails?.purchaseByCompanyId?.email : subscriptionDetails?.purchaseByDriverId?.email;
  
  let UserName = subscriptionDetails.role == CONSTANT.ROLES.COMPANY ? `${subscriptionDetails?.purchaseByCompanyId?.first_name } ${subscriptionDetails?.purchaseByCompanyId?.last_name}` : `${subscriptionDetails?.purchaseByDriverId?.first_name } ${subscriptionDetails?.purchaseByDriverId?.last_name}`;


  const subject = `Subscription Cancelled`
  const cancellationDate = new Date();
  const utcDate = new Date(cancellationDate.getTime() - (cancellationDate.getTimezoneOffset() * 60000));
 
  
  let subscriptionData = {
                          userName: UserName,
                          planName: planDetails.name, 
                          subsctiptionId: subsctiptionId,
                          cancellationDate: utcDate.toString(),
                          endPeriod: subscriptionDetails.endPeriod,
                          amount: subscriptionDetails.amount.toFixed(2),
                        }

  
  const emailSent = await sendEmail(
                                      toEmail, // Receiver email
                                      subject, // Subject
                                      "subscription-cancelled", // Template name (without .ejs extension)
                                      subscriptionData,
                                      'en', //  for lanuguage
                                      [] // for attachment
                                    )
  return emailSent
}

exports.sendEmailMissingInfoStripeOnboarding = async (accountId , missingFields = "" ) => {

  let userCondition = {connectedAccountId : accountId}
  const userDetail = await user_model.findOne(userCondition);
  const onboardingLink = await this.stripeOnboardingAccountLink(accountId , userDetail._id)
  const subject = `Action Required: Complete Your Stripe Account Setup`;
  let toEmail = userDetail?.email;
  
  const data = {
                  userName: `${userDetail.first_name} ${userDetail.last_name}`,
                  missingFields: missingFields,
                  onboardingLink:onboardingLink,
                  baseUrl: process.env.BASEURL,
                  supportEmail: process.env.SUPPORT_EMAIL
                }

  const emailSent = await sendEmail(
                                      toEmail, // Receiver email
                                      subject, // Subject
                                      "missing-info-stripe-onboard", // Template name (without .ejs extension)
                                      data,
                                      'en', //  for lanuguage
                                      [] // for attachment
                                    );

  return emailSent;
}

exports.sendEmailDriverCreation = async (driverInfo , randomPasword) => {

  let bodyHtml = ``;
  let subject = ``;
  if (randomPasword ) {

    subject = `Welcome mail`;
    const driverData = {
      driverName: `${driverInfo.first_name} ${driverInfo.last_name}`,
      driverEmail: driverInfo.email,
      randomPasword:randomPasword,
      baseUrl: process.env.BASEURL,
      supportEmail: process.env.SUPPORT_EMAIL
    }

    const emailSent = await sendEmail(
                                        driverInfo.email, // Receiver email
                                        subject, // Subject
                                        "driver-account-created", // Template name (without .ejs extension)
                                        driverData,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
    return emailSent
   
  } else {
    
    subject = `Complete Your Driver Registration`;

    const driverData = {
                          driverName: `${driverInfo.first_name} ${driverInfo.last_name}`,
                          supportEmail: process.env.SUPPORT_EMAIL
                        }
   
    const emailSent = await sendEmail(
                                        driverInfo.email, // Receiver email
                                        subject, // Subject
                                        "register-driver", // Template name (without .ejs extension)
                                        driverData,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
    return emailSent;
  }
}

exports.driverDocumentSubmissionEmail = async (driverInfo) => {


    let subject = `Your Documents Are Under Review – iDispatch Mobility Driver Onboarding`;
    const driverData = {
      driverName: `${driverInfo.first_name} ${driverInfo.last_name}`,
      driverEmail: driverInfo.email,
      baseUrl: process.env.BASEURL,
      supportEmail: process.env.SUPPORT_EMAIL
    }

    const emailSent = await sendEmail(
                                        driverInfo.email, // Receiver email
                                        subject, // Subject
                                        "driver-document-submission", // Template name (without .ejs extension)
                                        driverData,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );

    return emailSent
}

exports.driverDocumentVerifiedEmail = async (driverInfo) => {


    let subject = `Verified – Welcome to iDispatch Mobility `;
    const driverData = {
      driverName: `${driverInfo.first_name} ${driverInfo.last_name}`,
      // driverEmail: driverInfo.email,
      baseUrl: process.env.BASEURL,
      // supportEmail: process.env.SUPPORT_EMAIL
    }

    const emailSent = await sendEmail(
                                        driverInfo.email, // Receiver email
                                        subject, // Subject
                                        "driver-document-verified", // Template name (without .ejs extension)
                                        driverData,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );

    return emailSent
}

exports.passwordResetOtpEmail = async (info , otp) => {

  try {

    let subject = `Password Reset Code – iDispatch  Mobility `;
    const data = {
      userName: `${info.first_name} ${info.last_name}`,
      email: info.email,
      otp: otp,
      // baseUrl: process.env.BASEURL,
      supportEmail: process.env.SUPPORT_EMAIL
    }

    const emailSent = await sendEmail(
                                        info.email, // Receiver email
                                        subject, // Subject
                                        "password-reset-otp", // Template name (without .ejs extension)
                                        data,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
    return emailSent
  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌ passwordResetOtpEmail error --------------' , err.message)
  }

    
}

exports.driverDocumentRejectionEmail = async (driverInfo ,  docType = "" , reason = "" ) => {


    let subject = `Important: Your Document Submission Has Been Rejected`;
    const data = {
      userName: `${driverInfo.first_name} ${driverInfo.last_name}`,
      email: driverInfo.email,
      rejectedDocument: {
          docType: docType,
          reason: reason
      },
      baseUrl: process.env.BASEURL,
      supportEmail: process.env.SUPPORT_EMAIL
    }

    const emailSent = await sendEmail(
                                        driverInfo.email, // Receiver email
                                        subject, // Subject
                                        "driver-document-rejection", // Template name (without .ejs extension)
                                        data,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
    return emailSent
}

exports.driverDocumentExpirationReminderEmail = async (driverInfo , expiryDate = null ,  documentName = "" , docType = "" , daysLeft = 0 ) => {


    let subject = `Important: Your Document expiring soon`;
    const data = {
      userName: `${driverInfo.first_name} ${driverInfo.last_name}`,
      documentName: documentName,
      expiryDate: expiryDate,
      docType: docType,
      daysLeft: daysLeft,
      baseUrl: process.env.BASEURL,
      supportEmail: process.env.SUPPORT_EMAIL
    }
    
    const emailSent = await sendEmail(
                                        driverInfo.email, // Receiver email
                                        subject, // Subject
                                        "driver-document-expiry-reminder", // Template name (without .ejs extension)
                                        data,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
                                      
    return emailSent
}

exports.driverDocumentExpirationEmail = async (driverInfo , expiryDate = null ,  documentName = "" , docType = "") => {


    let subject = `Important: your document has expired`;
    const data = {
      userName: `${driverInfo.first_name} ${driverInfo.last_name}`,
      documentName: documentName,
      expiryDate: expiryDate,
      docType: docType,
      baseUrl: process.env.BASEURL,
      supportEmail: process.env.SUPPORT_EMAIL
    }
    
    const emailSent = await sendEmail(
                                        driverInfo.email, // Receiver email
                                        // "vsingh@codenomad.net", // Receiver email
                                        subject, // Subject
                                        "driver-document-expired", // Template name (without .ejs extension)
                                        data,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
                                      
    return emailSent
}

exports.companyHotelAccountCreationEmail = async (userInfo , password) => {


    let subject = `Welcome to iDispatch  Mobility – Your Account Is Now Active`; 
    const data = {
      userName: `${userInfo.first_name} ${userInfo.last_name}`,
      email: userInfo.email,
      role: userInfo.role,
      password: password,
      baseUrl: process.env.BASEURL,
      supportEmail: process.env.SUPPORT_EMAIL
    }

    const emailSent = await sendEmail(
                                        userInfo.email, // Receiver email
                                        subject, // Subject
                                        "company-hotel-account-creation", // Template name (without .ejs extension)
                                        data,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
    return emailSent
}

exports.adminAccountCreationEmail = async (userInfo , password) => {


    let subject = `Welcome to iDispatch  Mobility – Your Account Is Now Active`; 
    const data = {
      userName: `${userInfo.first_name} ${userInfo.last_name}`,
      email: userInfo.email,
      password: password,
      baseUrl: process.env.BASEURL,
      supportEmail: process.env.SUPPORT_EMAIL
    }

    const emailSent = await sendEmail(
                                        userInfo.email, // Receiver email
                                        subject, // Subject
                                        "admin-creation", // Template name (without .ejs extension)
                                        data,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
    return emailSent
}

exports.notifyPayoutPaid = async (userInfo , tripDetails , payoutDetails) => {

  
  let toEmail = userInfo?.email;
  
  let UserName = `${userInfo?.first_name } ${userInfo?.last_name } `;
 
  const currentDate = new Date();

  // Get day, month, and year
  const day = String(currentDate.getDate()).padStart(2, '0'); // Add leading zero if needed
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are 0-based, add 1 and pad
  const year = String(currentDate.getFullYear()); // Get last two digits of the year

  // Format date as dd mm yy
  const formattedDate = `${day}-${month}-${year}`;
  const subject = `Your Payout Has Been Successfully Processed`
  const bodyHtml =  `
                      <p>
                          Dear ${UserName},
                          <br><br>
                          We are pleased to inform you that your recent payout has been successfully processed.
                          
                          <br><br>
                          

                          <ul>
                            <li> <span style="font-weight:bold;">Payout ID:</span> ${payoutDetails?.id}</li>
                            <li> <span style="font-weight:bold;">Amount:</span> ${(payoutDetails?.amount / 100).toFixed(2)} €</li>
                            <li> <span style="font-weight:bold;">Date:</span> ${new Date().toISOString()}</li>
                          </ul>

                          <br><br>
                          The funds should now be available in your bank account, depending on your bank’s processing times.
                          <br><br>
                          If you have any questions or need further assistance, feel free to contact our support team.

                          Best regards,
                          Idispatch Mobility Team
                      </p>
                    `;
  let template = ` ${bodyHtml}`

  var transporter = nodemailer.createTransport(emailConstant.credentials);
  var mailOptions = {
                      from: emailConstant.from_email,
                      to: toEmail,
                      subject: subject,
                      html: template
                    };
  let sendEmail = await transporter.sendMail(mailOptions);
  return sendEmail
}

exports.notifyPayoutFailure = async (userInfo , tripDetails , payoutDetails) => {

  
  let toEmail = userInfo?.email;
  
  let UserName = `${userInfo?.first_name } ${userInfo?.last_name } `;
 
  const currentDate = new Date();

  // Get day, month, and year
  const day = String(currentDate.getDate()).padStart(2, '0'); // Add leading zero if needed
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are 0-based, add 1 and pad
  const year = String(currentDate.getFullYear()); // Get last two digits of the year

  // Format date as dd mm yy
  const formattedDate = `${day}-${month}-${year}`;
  const subject = `Your Payout Could Not Be Processed`
  const bodyHtml =  `
                      <p>
                          Dear ${UserName},
                          <br><br>
                          We regret to inform you that your recent payout attempt could not be processed.
                          
                          <br><br>
                          

                          <ul>
                            <li> <span style="font-weight:bold;">Payout ID:</span> ${payoutDetails?.id}</li>
                            <li> <span style="font-weight:bold;">Amount:</span> ${(payoutDetails?.amount / 100).toFixed(2)} €</li>
                            <li> <span style="font-weight:bold;">Failure Reason:</span> ${payoutDetails?.failure_message}</li>
                          </ul>

                          <br><br>
                          Please ensure that your bank account details are accurate and up to date. If the issue persists or if you need any help resolving it, don’t hesitate to contact our support team.
                          <br><br>
                          We’re here to assist you at every step.

                          Best regards,
                          Idispatch Mobility Team
                      </p>
                    `;
  let template = ` ${bodyHtml}`

  var transporter = nodemailer.createTransport(emailConstant.credentials);
  var mailOptions = {
                      from: emailConstant.from_email,
                      to: toEmail,
                      subject: subject,
                      html: template
                    };
  let sendEmail = await transporter.sendMail(mailOptions);
  return sendEmail
}

exports.canDriverOperate = async (driverId) => {
  try {
      let driver_full_info = await driver_model.findOne({ _id: driverId });

      if (driver_full_info) {

        if (!driver_full_info?.is_blocked) {
          
          if (driver_full_info?.defaultVehicle) {

            const userPurchasedPlans = await this.getUserActivePaidPlans(driver_full_info);

            if (userPurchasedPlans.length > 0 || driver_full_info?.is_special_plan_active) {
              return  {
                        isPassed: true,
                        message: `This driver has met all the conditions to receive a trip.`
                      }
              } else {
                return  {
                  isPassed: false,
                  message: `The driver must have at least one subscription plan`
                }
              
            }
          } else {
            return  {
                      isPassed: false,
                      message: `The driver must have at least one registered vehicle.`
                    }
          }
        } else {
          return  {
                    isPassed: false,
                    message: `This driver is currently blocked.`
                  }
        }
      } else {
        return {
          isPassed: false,
          message: `Driver doen't exist`
        }
      }
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error can driver operate:', error.message);
    console.error("Error can driver operate:", error);
    // throw error;
    return {
      isPassed: false,
      message: `Driver doen't exist`
    }
  }
  
}

exports.willCompanyPayCommissionOnTrip =  async (userInfo) => {

  // Get the plan if plan end date will not expire base don current date and it is paid. it is doesn't matter if client cancel that subscription 
  const currentDate = new Date();
  let conditions = {
                      role: userInfo.role == CONSTANT.ROLES.COMPANY ? CONSTANT.ROLES.COMPANY : CONSTANT.ROLES.DRIVER,
                      paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                      endPeriod: { $gt: currentDate }, // Ensure endPeriod is greater than the current date
                  }

  if (userInfo.role == CONSTANT.ROLES.COMPANY) {
    
    conditions.purchaseByCompanyId = userInfo._id;
  } else {
    conditions.purchaseByDriverId = userInfo._id;
  }
  
  const subscriptions = await SUBSCRIPTION_MODEL.aggregate([
                                                            { 
                                                                $match: conditions 
                                                            },
                                                            {
                                                                $lookup: {
                                                                    from: "plans",  // The name of the Plan collection
                                                                    localField: "planId",
                                                                    foreignField: "planId",
                                                                    as: "planDetails"
                                                                }
                                                            },
                                                            {
                                                                $unwind: { path: "$planDetails", preserveNullAndEmptyArrays: true } 
                                                            },
                                                            {
                                                                $lookup: {
                                                                    from: "users",  // Adjust if your company collection has a different name
                                                                    localField: "purchaseByCompanyId",
                                                                    foreignField: "_id",
                                                                    as: "purchaseByCompanyId"
                                                                }
                                                            },
                                                            {
                                                                $unwind: { path: "$purchaseByCompanyId", preserveNullAndEmptyArrays: true }
                                                            },
                                                            {
                                                                $lookup: {
                                                                    from: "drivers",  // Adjust if your driver collection has a different name
                                                                    localField: "purchaseByDriverId",
                                                                    foreignField: "_id",
                                                                    as: "purchaseByDriverId"
                                                                }
                                                            },
                                                            {
                                                                $unwind: { path: "$purchaseByDriverId", preserveNullAndEmptyArrays: true }
                                                            },
                                                            {
                                                              $sort: { _id: -1 }  // Sorting in descending order by _id (newest first)
                                                            }
                                                        ]);

    
      if (subscriptions.length > 0) {

        const isProPlan = await subscriptions.filter( (plan) => plan?.planDetails?.name == CONSTANT.SUBSCRIPTION_PLAN_NAMES.PRO);

        if (isProPlan.length > 0) {
          return  {
                    commision: false,
                    paidPlan: true,
                    planName: CONSTANT.SUBSCRIPTION_PLAN_NAMES.PRO,
                    specialPlan: false,
                    subscriptionDetail: isProPlan[0]
                  }
        } else {

          return  {
            commision: true,
            paidPlan: true,
            planName: CONSTANT.SUBSCRIPTION_PLAN_NAMES.PREMIUM,
            specialPlan: false,
            subscriptionDetail: subscriptions[0]
          }
        }

      } else {

        
        if (userInfo.is_special_plan_active) {

          return {
            commision: true,
            paidPlan: false,
            planName: CONSTANT.SUBSCRIPTION_PLAN_NAMES.SPECIAL,
            specialPlan: true,
            subscriptionDetail: null
          }
        } else {

          return {
            commision: true,
            paidPlan: false,
            planName: "",
            specialPlan: false,
            subscriptionDetail: null
          }
        }
      }

    return subscriptions;

}

exports.getUserActivePaidPlans = async (userInfo) => {

  // Get the plan if plan end date will not expire base don current date and it is paid. it is doesn't matter if client cancel that subscription 
  const currentDate = new Date();
  let conditions = {
                      role: userInfo.role == CONSTANT.ROLES.COMPANY ? CONSTANT.ROLES.COMPANY : CONSTANT.ROLES.DRIVER,
                      paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                      endPeriod: { $gt: currentDate }, // Ensure endPeriod is greater than the current date
                  }

  if (userInfo.role == CONSTANT.ROLES.COMPANY) {
    
    conditions.purchaseByCompanyId = userInfo._id;
  } else {
    conditions.purchaseByDriverId = userInfo._id;
  }
  
  return await SUBSCRIPTION_MODEL.find(conditions).populate('purchaseByCompanyId').populate('purchaseByDriverId');
}

exports.getDriverTripsRanked = async (driverId, tripStatus, options = {}) => {

  try {

    const {
      page = 1,
      limit = 10,
      sortDate = { pickup_date_time: 1 },
    } = options;

    const safePage = Math.max(parseInt(page, 10) || 1, 1);
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 50);
    const skip = (safePage - 1) * safeLimit;

    const status = (tripStatus || CONSTANT.TRIP_STATUS.BOOKED).toString().trim();
    const driverObjectId = new mongoose.Types.ObjectId(driverId);
    // ✅ If driver requests BOOKED tab -> include ACTIVE+REACHED also, but rank them first
    const isBookedTab = status === CONSTANT.TRIP_STATUS.BOOKED;

    const match = {
                    status: true,
                    is_deleted: false,
                    driver_name: driverObjectId,
                    trip_status: isBookedTab
                      ? { $in: [CONSTANT.TRIP_STATUS.ACTIVE, CONSTANT.TRIP_STATUS.REACHED, CONSTANT.TRIP_STATUS.BOOKED] }
                      : status,
                    ...(!isBookedTab ? {is_paid: CONSTANT.DRIVER_TRIP_PAYMENT.UNPAID} : {})
                  };

    // ✅ Rank order only for BOOKED tab
  const addRankStage = isBookedTab
    ? {
        $addFields: {
          statusRank: {
            $switch: {
              branches: [
                // 1) ACTIVE
                { case: { $eq: ["$trip_status", CONSTANT.TRIP_STATUS.ACTIVE] }, then: 0 },

                // 2) REACHED
                { case: { $eq: ["$trip_status", CONSTANT.TRIP_STATUS.REACHED] }, then: 1 },
                
                // 3) BOOKED + under_cancellation_review true
                {
                  case: {
                    $and: [
                      { $eq: ["$trip_status", CONSTANT.TRIP_STATUS.BOOKED] },
                      { $eq: ["$under_cancellation_review", true] },
                    ],
                  },
                  then: 2,
                },

                // 4) Normal BOOKED
                { case: { $eq: ["$trip_status", CONSTANT.TRIP_STATUS.BOOKED] }, then: 3 },
              ],
              default: 99,
            },
          },
        },
      }
    : { $addFields: { statusRank: 0 } };

    const pipeline = [
                      { $match: match },
                      addRankStage,

                      // ✅ One combined sorted stream
                      { $sort: { statusRank: 1, ...sortDate } },

                      // ✅ Facet: count + paginated data
                      {
                        $facet: {
                          meta: [{ $count: "totalCount" }],
                          data: [
                            { $skip: skip },
                            { $limit: safeLimit },

                            // ---------------- LOOKUPS only for returned docs ----------------
                            // ✅ driver lookup (only first_name, last_name)
                            // {
                            //   $lookup: {
                            //     from: "drivers",
                            //     let: { did: "$driver_name" },
                            //     pipeline: [
                            //       { $match: { $expr: { $eq: ["$_id", "$$did"] } } },
                            //       { $project: { first_name: 1, last_name: 1 } },
                            //     ],
                            //     as: "driver",
                            //   },
                            // },
                            // ✅ vehicle lookup (only number & model)
                            {
                              $lookup: {
                                from: "vehicles",
                                let: { vid: "$vehicle" },
                                pipeline: [
                                  { $match: { $expr: { $eq: ["$_id", "$$vid"] } } },
                                  { $project: { vehicle_number: 1, vehicle_model: 1 } },
                                ],
                                as: "vehicle",
                              },
                            },
                            {
                              $lookup: {
                                from: "agencies",
                                let: { hid: "$hotel_id" },
                                pipeline: [
                                  { $match: { $expr: { $eq: ["$user_id", "$$hid"] } } },
                                  { $project: { company_name: 1 } },
                                ],
                                as: "hotelData",
                              },
                            },
                            // ✅ userData lookup (agency row by agencies.user_id = created_by_company_id)
                            {
                              $lookup: {
                                from: "agencies",
                                let: { cid: "$created_by_company_id" },
                                pipeline: [
                                  { $match: { $expr: { $eq: ["$user_id", "$$cid"] } } },
                                  { $project: { company_name: 1, p_number: 1, phone: 1 } },
                                ],
                                as: "userData",
                              },
                            },
                            // ✅ companyData lookup (users by _id = created_by_company_id)
                            {
                              $lookup: {
                                from: "users",
                                let: { cid: "$created_by_company_id" },
                                pipeline: [
                                  { $match: { $expr: { $eq: ["$_id", "$$cid"] } } },
                                  { $project: { phone: 1, countryCode: 1 } },
                                ],
                                as: "companyData",
                              },
                            },
                            // ---------------- PROJECT ----------------
                            {
                              $project: {
                                _id: 1,
                                trip_from: 1,
                                trip_to: 1,
                                is_paid: 1,
                                passengerCount: 1,
                                pickup_date_time: 1,
                                trip_status: 1,
                                price: 1,
                                car_type: 1,
                                customerDetails: 1,
                                comment: 1,
                                commission: 1,
                                pay_option: 1,
                                under_cancellation_review:1,
                                navigation_mode: 1,
                                child_seat_price:1,
                                pickup_timezone:1,
                                payment_method_price:1,
                                customer_phone: { $ifNull: [{ $arrayElemAt: ["$userData.p_number", 0] }, "" ] },
                                company_phone: { $ifNull: [{ $arrayElemAt: ["$companyData.phone", 0] }, "" ] },
                                company_country_code: { $ifNull: [{ $arrayElemAt: ["$companyData.countryCode", 0] }, "" ] },

                                company_name:  { $ifNull: [{ $arrayElemAt: ["$userData.company_name", 0] }, "" ] },
                                user_company_name: { $ifNull: [{ $arrayElemAt: ["$userData.company_name", 0] }, "" ] },
                                // user_company_phone: { $ifNull: [{ $arrayElemAt: ["$userData.phone", 0] }, "" ] },

                                hotel_name: { $ifNull: [{ $arrayElemAt: ["$hotelData.company_name", 0] }, "" ] },

                                // driver_name: {
                                //           $trim: {
                                //             input: {
                                //               $concat: [
                                //                 { $ifNull: [{ $arrayElemAt: ["$driver.first_name", 0] }, "" ] },
                                //                 " ",
                                //                 { $ifNull: [{ $arrayElemAt: ["$driver.last_name", 0] }, "" ] },
                                //               ],
                                //             },
                                //           },
                                //         },

                                // ✅ vehicle => normal string
                                vehicle: {
                                  $trim: {
                                    input: {
                                      $concat: [
                                        { $ifNull: [{ $arrayElemAt: ["$vehicle.vehicle_number", 0] }, "" ] },
                                        " ",
                                        { $ifNull: [{ $arrayElemAt: ["$vehicle.vehicle_model", 0] }, "" ] },
                                      ],
                                    },
                                  },
                                },

                                trip_id: 1,
                              },
                            },
                          ],
                        },
                      },

                      // ✅ flatten meta
                      {
                        $addFields: {
                          totalCount: { $ifNull: [{ $arrayElemAt: ["$meta.totalCount", 0] }, 0] },
                        },
                      },
                      { $project: { meta: 0 } },
                    ];

    const result = await TRIP_MODEL.aggregate(pipeline).allowDiskUse(true);
    return  {
              totalCount: result?.[0]?.totalCount || 0,
              trips: result?.[0]?.data || [],
              page: safePage,
              limit: safeLimit,
            };

  } catch (err) {
  
      console.log('❌❌❌❌❌❌❌❌❌Error getDriverTrips helper fucntion:', err.message);
      
    }
}

exports.getCompanyActivePaidPlans = async (companyId) => {

  // Get the plan if plan end date will not expire base don current date and it is paid. it is doesn't matter if client cancel that subscription 
  const currentDate = new Date();
  let conditions = {
                      role: CONSTANT.ROLES.COMPANY,
                      paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                      endPeriod: { $gt: currentDate }, // Ensure endPeriod is greater than the current date
                      purchaseByCompanyId : new mongoose.Types.ObjectId(companyId)
                  }

  return await SUBSCRIPTION_MODEL.find(conditions).populate('purchaseByCompanyId').populate('purchaseByDriverId');
}

exports.getCompanyActivePaidPlansBulk = async (companyObjectIds) => {

  const currentDate = new Date();
  const paidCompaniesRows = await SUBSCRIPTION_MODEL.find(
      {
        role: CONSTANT.ROLES.COMPANY,
        paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.PAID,
        endPeriod: { $gt: currentDate },
        purchaseByCompanyId: { $in: companyObjectIds },
      },
      { purchaseByCompanyId: 1 }
    ).lean();

    return paidCompaniesRows ? paidCompaniesRows : []
}

exports.getUserCurrentActivePayedPlan = async (userInfo) => {

  // Get the plan if plan end date will not expire based on the current date and it is paid. it is doesn't matter if client cancel that subscription 
  const currentDate = new Date();
  let conditions = {
                      role: userInfo.role == CONSTANT.ROLES.COMPANY ? CONSTANT.ROLES.COMPANY : CONSTANT.ROLES.DRIVER,
                      paid: CONSTANT.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                      endPeriod: { $gt: currentDate }, // Ensure endPeriod is greater than the current date
                      active: CONSTANT.SUBSCRIPTION_STATUS.ACTIVE
                  }

  if (userInfo.role == CONSTANT.ROLES.COMPANY) {
    
    conditions.purchaseByCompanyId = userInfo._id;
  } else {
    conditions.purchaseByDriverId = userInfo._id;
  }

 
  let activePlan = await SUBSCRIPTION_MODEL.findOne(conditions).populate('purchaseByCompanyId').populate('purchaseByDriverId').lean();  // Use lean to get plain objects
  
  if (activePlan) {

    const planDetails = await PLANS_MODEL.findOne({planId: activePlan.planId});
    activePlan.planDetails = planDetails ? planDetails : {}
  }

  return activePlan
}

exports.terminateSubscriptionForBlockedDriver = async (userinfo) => {

  try {

  
    const currentActivePlan = await this.getUserCurrentActivePayedPlan(userinfo);

    
    if (currentActivePlan) {
      const subscriptionId = currentActivePlan?.subscriptionId;

      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      if (stripeSubscription.status !== 'canceled') {

        const canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);
      }
      

      let option = { new: true };
      let updatedData = {
          active: constant.SUBSCRIPTION_STATUS.INACTIVE,
          cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.DRIVER_BLOACKED_BY_ADMIN
      }
      
      await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);

      await this.informUserSubscriptionCanceledDueToBlock(subscriptionId)
    }
    console.log('currentActivePlan---------' , currentActivePlan)
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error terminateSubscriptionForBlockedDriver:', error.message);
    throw error;
  }
}

exports.informUserSubscriptionCanceledDueToBlock = async (subsctiptionId) => {

  let subscriptionDetails = await SUBSCRIPTION_MODEL.findOne({subscriptionId: subsctiptionId}).populate('purchaseByCompanyId').populate('purchaseByDriverId');
  const planDetails = await PLANS_MODEL.findOne({planId:subscriptionDetails?.planId });
  let toEmail = subscriptionDetails.role == CONSTANT.ROLES.COMPANY ? subscriptionDetails?.purchaseByCompanyId?.email : subscriptionDetails?.purchaseByDriverId?.email;
  let UserName = subscriptionDetails.role == CONSTANT.ROLES.COMPANY ? `${subscriptionDetails?.purchaseByCompanyId?.first_name } ${subscriptionDetails?.purchaseByCompanyId?.last_name}` : `${subscriptionDetails?.purchaseByDriverId?.first_name } ${subscriptionDetails?.purchaseByDriverId?.last_name}`;
  
  const now = new Date();
  const formattedDateTime = now.toLocaleString("en-GB", { 
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false // Use 24-hour format
  });
  const subject = `Important Notice: Subscription Cancelled Due to Account Suspension`
  const bodyHtml =  `
                      <p>
                          Dear ${UserName},
                          <br><br>
                          We regret to inform you that your subscription to Idispatch Mobility has been cancelled due to the suspension of your ${subscriptionDetails.role} account. This action was taken as part of our policy enforcement.
                          
                          <br><br>
                          
                          <span style="font-weight:bold;">Subscription Details:</span>
                          
                          <br><br>

                          <ul>
                            <li> <span style="font-weight:bold;">Subscription ID:</span> ${subsctiptionId}</li>
                            <li> <span style="font-weight:bold;">Plan Name:</span> ${planDetails.name}</li>
                            <li> <span style="font-weight:bold;">Cancellation  Date:</span> ${formattedDateTime}</li>
                          </ul>

                          <br><br>
                          If you believe this action was taken in error or require further clarification, please contact our support team at <a href="mailto: ${process.env.SUPPORT_EMAIL}"> ${process.env.SUPPORT_EMAIL}</a>.
                          <br><br>
                          Best regards,
                          Idispatch Mobility Team
                      </p>
                    `;
  let template = ` ${bodyHtml}`

  var transporter = nodemailer.createTransport(emailConstant.credentials);
  var mailOptions = {
                      from: emailConstant.from_email,
                      to: toEmail,
                      subject: subject,
                      html: template,
                    };
  let sendEmail = await transporter.sendMail(mailOptions);
  return sendEmail
}

exports.notifyUserAccountBlocked = async (userInfo) => {

  let toEmail = userInfo?.email;
  let UserName = `${userInfo?.first_name } ${userInfo?.last_name}`;
  
  const now = new Date();
  const formattedDateTime = now.toLocaleString("en-GB", { 
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false // Use 24-hour format
  });
  
  const subject = `Important Notice: Your Account Has Been Blocked`
  const bodyHtml =  `
                      <p>
                          Dear ${UserName},
                          <br><br>
                           We regret to inform you that your  <b>${ userInfo.role}</b> account with Idispatch Mobility has been blocked by the administration. This action has been taken as part of our compliance and security policies.
                          
                          <br><br>
                          
                          <span style="font-weight:bold;">Account Details:</span>
                          
                          <br><br>

                          <ul>
                             <li> <span style="font-weight:bold;">Role:</span> ${ userInfo.role} </li>
                            <li> <span style="font-weight:bold;">Account Status:</span> Blocked</li>
                            <li> <span style="font-weight:bold;">Effective Date:</span> ${formattedDateTime}</li>
                          </ul>

                          <br><br>
                          If you believe this action was taken in error or require further clarification, please contact our support team at <a href="mailto: ${process.env.SUPPORT_EMAIL}"> ${process.env.SUPPORT_EMAIL}</a>.
                          <br><br>
                          Best regards,
                          Idispatch Mobility Team
                      </p>
                    `;
  let template = ` ${bodyHtml}`

  var transporter = nodemailer.createTransport(emailConstant.credentials);
  var mailOptions = {
                      from: emailConstant.from_email,
                      to: toEmail,
                      subject: subject,
                      html: template
                    };
  let sendEmail = await transporter.sendMail(mailOptions);
  return sendEmail
}

exports.notifyUserAccountReactivated = async (userInfo) => {

  let toEmail = userInfo?.email;
  let UserName = `${userInfo?.first_name } ${userInfo?.last_name}`;
 
  const now = new Date();
  const formattedDateTime = now.toLocaleString("en-GB", { 
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false // Use 24-hour format
  });
  
  const subject = `Your Account Has Been Reactivated`
  const bodyHtml =  `
                      <p>
                          Dear ${UserName},
                          <br><br>
                           We are pleased to inform you that your <b>${ userInfo.role}</b> account on Idispatch Mobility has been successfully reactivated. You can now log in and resume using our platform’s services without any restrictions.
                          
                          <br><br>
                          
                          <span style="font-weight:bold;">Account Details:</span>
                          
                          <br><br>

                          <ul>
                             <li> <span style="font-weight:bold;">Role:</span> ${ userInfo.role} </li>
                            <li> <span style="font-weight:bold;">Account Status:</span> Active</li>
                            <li> <span style="font-weight:bold;">Effective Date:</span> ${formattedDateTime}</li>
                          </ul>

                          <br><br>
                          If you believe this action was taken in error or require further clarification, please contact our support team at <a href="mailto: ${process.env.SUPPORT_EMAIL}"> ${process.env.SUPPORT_EMAIL}</a>.
                          <br><br>
                          Best regards,
                          Idispatch Mobility Team
                      </p>
                    `;
  let template = ` ${bodyHtml}`

  var transporter = nodemailer.createTransport(emailConstant.credentials);
  var mailOptions = {
                      from: emailConstant.from_email,
                      to: toEmail,
                      subject: subject,
                      html: template
                    };
  let sendEmail = await transporter.sendMail(mailOptions);
  return sendEmail
}

// get the trip that has been completed before 1 week
exports.getPendingPayoutTripsBeforeWeek = async () => {
  try {

    const sevenDaysAgo = new Date();
    console.log(`sevenDaysAgo--------` , sevenDaysAgo)
    // sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 2);

    //  get the trips who have account attached with stripe then we can also transfer into his account
    const trips = await TRIP_MODEL.aggregate([
                                              {
                                                $match: { 
                                                          trip_status: constant.TRIP_STATUS.COMPLETED,
                                                          // is_paid: true,
                                                          is_company_paid: false,
                                                          company_trip_payout_status: constant.PAYOUT_TANSFER_STATUS.NOT_INITIATED,
                                                          // pickup_date_time: { $lt: sevenDaysAgo },
                                                        } 
                                              },
                                              {
                                                $lookup: {
                                                  from: "users", 
                                                  let: { companyId: "$created_by_company_id" }, // Use trip's `created_by_company_id`
                                                  pipeline: [
                                                    {
                                                      $match: {
                                                        $expr: { $eq: ["$_id", "$$companyId"] }, // Match `user._id` with `created_by_company_id`
                                                        isAccountAttched: CONSTANT.CONNECTED_ACCOUNT.ACCOUNT_ATTACHED_STATUS.ACCOUNT_ATTACHED, // Filter users where `isAccountAttched: true`
                                                        connectedAccountId: { $ne: ""  }
                                                      }
                                                    }
                                                  ],
                                                  as: "companyDetails"
                                                }
                                              },
                                              { $unwind: "$companyDetails" }, // Remove trips without a matching company
                                              {
                                                $project: {
                                                  _id: 1,
                                                  created_by_company_id: 1,
                                                  trip_id:1,
                                                  pickup_date_time: 1,
                                                  is_company_paid:1,
                                                  companyPaymentAmount:1,
                                                  price:1,
                                                  driverPaymentAmount:1,
                                                  child_seat_price:1,
                                                  payment_method_price:1,
                                                  "companyDetails.connectedAccountId": 1,
                                                  "companyDetails.stripeCustomerId": 1,
                                                  "companyDetails.email": 1,
                                                }
                                              }
                                            ]);

    return trips
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error getPendingPayoutTripsBeforeWeek:', error.message);
    throw error;
  }
}


exports.dateFilter = async ( postData ) => {
  try {
    
    let dateFilter = postData.dateFilter; // Corrected variable name
    if (!['all', 'this_week', 'this_month', 'this_year', 'dateRange'].includes(dateFilter)) {
      dateFilter = "all";
    }
    let dateQuery = {};
    if (dateFilter !== "all") {
      let startDate, endDate;
      const today = new Date();
      switch (dateFilter) {
        case "this_week":
          const todayDay = today.getDay();
          startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - todayDay
          );
          endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + (6 - todayDay)
          );
          break;
        case "this_month":
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;
        case "this_year":
          startDate = new Date(today.getFullYear(), 0, 1);
          endDate = new Date(today.getFullYear(), 11, 31);
          break;
        case "dateRange":
          startDate = new Date(postData.startDate);
          endDate = new Date(postData.endDate);

          // Modify the Date object with setHours
          
        default:
          break;
      }

      startDate.setUTCHours(0, 0, 1, 0);
      endDate.setUTCHours(23, 59, 59, 999);

      // Convert the Date objects to ISO 8601 strings
      startDate = startDate.toISOString();
      endDate = endDate.toISOString();

      dateQuery = { pickup_date_time: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    }

    return dateQuery;
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error date filter:', error.message);
    throw error;
  }
}


exports.checkPayouts = async (connectedAccountId) => {

  try {

    const payouts = await stripe.payouts.list(
                                                { limit: 5 }, // Retrieve the last 5 payouts
                                                { stripeAccount: connectedAccountId } // For a specific connected account
                                              );

    console.log("Payout Successful:", payouts);

    // pending	 => Stripe has scheduled the payout, but it hasn’t started yet.
    // in_transit	=> The payout is being processed and on the way to the bank.
    // paid	 => The money has reached the connected account’s bank.
    // failed	=> The payout failed (e.g., incorrect bank details).

    return payouts?.data;
  } catch (error) {

    console.log('❌❌❌❌❌❌❌❌❌Error checkPayouts status:', error.message);
    throw error;
  }
}

exports.notifyInsufficientBalance = async () => {

  try{

    let emails = await user_model.find({ role: CONSTANT.ROLES.SUPER_ADMIN }).distinct("email"); // Returns an array of unique email addresses directly.
    // emails = emails.join(",");
   
    const subject = `Insufficient Balance Alert – Action Required`;

    const data = { supportEmail: process.env.SUPPORT_EMAIL }

    const emailSent = await sendEmail(
                                      emails, // Receiver email
                                      subject, // Subject
                                      "notify-insufficient-balance", // Template name (without .ejs extension)
                                      data,
                                      'en', //  for lanuguage
                                      [] // for attachment
                                    );
  
    
    return emailSent
    
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error notifyInsufficientBalance:', error.message);
    throw error;
  }
}

// when admin will delete the account of the user
exports.sendAccountDeactivationEmail = async (userInfo) => {

  try{

    let userDetail;

    if (userInfo?.role != constant.ROLES.DRIVER) {
      userDetail = await user_model.findById(userInfo?._id); 
    } else {
      userDetail = await driver_model.findById(userInfo?._id); 
    }
    
   
    const subject = `Important Notice Regarding Your Account`;

    const data = {
                  userName: `${userDetail.first_name} ${userDetail.last_name}`,
                  role: userDetail.role,
                  email: userDetail.email,
                  baseUrl: process.env.BASEURL,
                  supportEmail: process.env.SUPPORT_EMAIL
                }

  const emailSent = await sendEmail(
                                      userDetail?.email, // Receiver email
                                      subject, // Subject
                                      "account-deactivation", // Template name (without .ejs extension)
                                      data,
                                      'en', //  for lanuguage
                                      [] // for attachment
                                    );
  
    return emailSent
    
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error sending account deactivation email:', error.message);
    throw error;
  }
}

// when admin will delete the account of the user
exports.sendAccountReactivationEmail = async (userInfo) => {

  try{
    let userDetail;

    if (userInfo?.role != constant.ROLES.DRIVER) {
      userDetail = await user_model.findById(userInfo?._id); 
    } else {
      userDetail = await driver_model.findById(userInfo?._id); 
    }
   
    const subject = `Your Account Has Been Reactivated`;

    const data = {
                  userName: `${userDetail.first_name} ${userDetail.last_name}`,
                  role: userDetail.role,
                  email: userDetail.email,
                  baseUrl: process.env.BASEURL,
                  supportEmail: process.env.SUPPORT_EMAIL
                }

    const emailSent = await sendEmail(
                                        userDetail?.email, // Receiver email
                                        subject, // Subject
                                        "account-reactivation", // Template name (without .ejs extension)
                                        data,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
  
    return emailSent
    
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error sending account reactivation:', error.message);
    throw error;
  }
}

exports.transferTripToCompanyAccount = async (userInfo , io) => {

  // Whe driver will be block all the trips will be reassigned to the company and company with their account access and partner access
  try {

    if (userInfo.role == constant.ROLES.DRIVER) {
      // let driverTrips = await TRIP_MODEL.find({driver_name: userInfo._id , trip_status: { $ne: constant.TRIP_STATUS.COMPLETED }})
      let companyIds = await TRIP_MODEL.distinct("created_by_company_id", {
                                                                              driver_name: userInfo._id, 
                                                                              // trip_status: { $ne: constant.TRIP_STATUS.COMPLETED }
                                                                              trip_status: constant.TRIP_STATUS.BOOKED
                                                                          }
                                                );

      const updateTrips = await TRIP_MODEL.updateMany(
                                                          { driver_name: userInfo._id  , trip_status: constant.TRIP_STATUS.BOOKED},  // Find all trips assigned to the blocked driver
                                                          { $set: { driver_name: null, trip_status: constant.TRIP_STATUS.PENDING } }  // Update fields
                                                      );
    
      let driver_name = userInfo?.first_name + " " + userInfo?.last_name;

      for (let companyId of companyIds) {

        let companyDetail = await user_model.findById(companyId);
        const companyAgencyData = await AGENCY_MODEL.findOne({user_id: companyId});
        let companyMessage = `The driver (${driver_name}) assigned to your trips has been blocked. The affected trips have been returned to your account for reassignment.`;
        let companyAccountAccessMessage =`The driver (${driver_name})assigned to trips from the following account access: ${companyAgencyData?.company_name} Company has been blocked. The affected trips have been returned to their respective company accounts for reassignment.`
        let companyPartnerMessage =`The driver (${driver_name})assigned to trips from the following ${companyAgencyData?.company_name} Company (Your partner company) has been blocked. The affected trips have been returned to their respective company accounts for reassignment.`
        

        if (companyDetail?.socketId) {

          let targetLocale = companyDetail?.app_locale || process.env.DEFAULT_LANGUAGE;
          let companyMessage = i18n.__({ phrase: "editTrip.notification.transferTripCompanyMessage", locale: targetLocale }, { driver_name: driver_name });
          // socket for app
          await io.to(companyDetail?.socketId).emit("driverBlockTripReturned", { message: companyMessage  });

          // for refresh trip
          await io.to(companyDetail?.socketId).emit("refreshTrip",{ message: companyMessage  });
        }

        if (companyDetail?.webSocketId) {

          let targetLocale = companyDetail?.web_locale || process.env.DEFAULT_LANGUAGE;
          let companyMessage = i18n.__({ phrase: "editTrip.notification.transferTripCompanyMessage", locale: targetLocale }, { driver_name: driver_name });
          // socket for app
          await io.to(companyDetail?.webSocketId).emit("driverBlockTripReturned", { message: companyMessage  });

          // for refresh trip
          await io.to(companyDetail?.webSocketId).emit("refreshTrip",{ message: companyMessage  });
        }

        if (companyDetail?.deviceToken) {

          let targetLocale = companyDetail?.app_locale || process.env.DEFAULT_LANGUAGE;
          let companyMessage = i18n.__({ phrase: "editTrip.notification.transferTripCompanyMessage", locale: targetLocale }, { driver_name: driver_name });
          let title = i18n.__({ phrase: "editTrip.notification.transferTripCompanyTitle", locale: targetLocale });
          await this.sendNotification( user?.deviceToken,companyMessage, title, userInfo );
        }

        if (companyDetail?.webDeviceToken) {

          let targetLocale = companyDetail?.web_locale || process.env.DEFAULT_LANGUAGE;
          let companyMessage = i18n.__({ phrase: "editTrip.notification.transferTripCompanyMessage", locale: targetLocale }, { driver_name: driver_name });
          let title = i18n.__({ phrase: "editTrip.notification.transferTripCompanyTitle", locale: targetLocale });
          await this.sendNotification( user?.webDeviceToken , companyMessage , title, userInfo );
        }


        // For the driver who has company access
          
        const driverHasCompanyAccess = await driver_model.find({
                                                                  _id: { $ne: userInfo._id}, //Notifications and pop-ups will exclude the driver currently assigned to the ride.
                                                                  company_account_access  : { $elemMatch: { company_id: new mongoose.Types.ObjectId(companyId) } },
                                                              });

        if (driverHasCompanyAccess){

          for (let driverCompanyAccess of driverHasCompanyAccess) {
            
            if (driverCompanyAccess?.socketId) {

              let targetLocale = driverCompanyAccess?.app_locale || process.env.DEFAULT_LANGUAGE;
              let companyAccountAccessMessage = i18n.__({ phrase: "editTrip.notification.transferTripAccountAccessMessage", locale: targetLocale }, { driver_name: driver_name  , company_name: companyAgencyData?.company_name});
              await io.to(driverCompanyAccess?.socketId).emit("driverBlockTripReturned", { message: companyAccountAccessMessage, });
            }

            if (driverCompanyAccess?.webSocketId) {

              let targetLocale = driverCompanyAccess?.web_locale || process.env.DEFAULT_LANGUAGE;
              let companyAccountAccessMessage = i18n.__({ phrase: "editTrip.notification.transferTripAccountAccessMessage", locale: targetLocale }, { driver_name: driver_name  , company_name: companyAgencyData?.company_name});
              await io.to(driverCompanyAccess?.webSocketId).emit("driverBlockTripReturned", { message: companyAccountAccessMessage, });
            }

            if (driverCompanyAccess?.deviceToken) {

              let targetLocale = driverCompanyAccess?.app_locale || process.env.DEFAULT_LANGUAGE;

              let companyAccountAccessMessage = i18n.__({ phrase: "editTrip.notification.transferTripAccountAccessMessage", locale: targetLocale }, { driver_name: driver_name  , company_name: companyAgencyData?.company_name});

              let title = i18n.__({ phrase: "editTrip.notification.transferTripAccountAccessTitle", locale: targetLocale }, { company_name: companyAgencyData?.company_name});

              await this.sendNotification(
                                      driverCompanyAccess?.deviceToken,
                                      companyAccountAccessMessage,
                                      title, 
                                      userInfo 
                                    );
            }

            if (driverCompanyAccess?.webDeviceToken) {

              let targetLocale = driverCompanyAccess?.web_locale || process.env.DEFAULT_LANGUAGE;

              let companyAccountAccessMessage = i18n.__({ phrase: "editTrip.notification.transferTripAccountAccessMessage", locale: targetLocale }, { driver_name: driver_name  , company_name: companyAgencyData?.company_name});

              let title = i18n.__({ phrase: "editTrip.notification.transferTripAccountAccessTitle", locale: targetLocale }, { company_name: companyAgencyData?.company_name});

              await this.sendNotification(
                                      driverCompanyAccess?.webDeviceToken,
                                      companyAccountAccessMessage,
                                      title, 
                                      userInfo 
                                    );
            }
          }
        }

        // functionality for the drivers who have account access as partner
        const driverHasCompanyPartnerAccess = await driver_model.find({
                                                                        _id: { $ne: userInfo._id}, //Notifications and pop-ups will exclude the driver currently assigned to the ride.
                                                                        parnter_account_access : {
                                                                          $elemMatch: { company_id: new mongoose.Types.ObjectId(companyId) },
                                                                        },
                                                                      });

        if (driverHasCompanyPartnerAccess){

          for (let partnerAccount of driverHasCompanyPartnerAccess) {

            // for partner app side
            if (partnerAccount?.socketId) {

              let targetLocale = partnerAccount?.app_locale || process.env.DEFAULT_LANGUAGE;
              let companyPartnerMessage = i18n.__({ phrase: "editTrip.notification.transferTripcompanyPartnerMessage", locale: targetLocale }, { driver_name: driver_name  , company_name: companyAgencyData?.company_name});

              await io.to(partnerAccount?.socketId).emit("driverBlockTripReturned", { message: companyPartnerMessage, } );
                
              // for refresh trip
              await io.to(partnerAccount?.socketId).emit( "refreshTrip",{ message: companyPartnerMessage, } );
            }

            // for partner Web side
            if (partnerAccount?.webSocketId) {

              let targetLocale = partnerAccount?.web_locale || process.env.DEFAULT_LANGUAGE;
              let companyPartnerMessage = i18n.__({ phrase: "editTrip.notification.transferTripcompanyPartnerMessage", locale: targetLocale }, { driver_name: driver_name  , company_name: companyAgencyData?.company_name});

              await io.to(partnerAccount?.webSocketId).emit("driverBlockTripReturned", { message: companyPartnerMessage, } );

              await io.to(partnerAccount?.webSocketId).emit("refreshTrip",  { message: companyPartnerMessage, } );
            }

            // If driver has device token to send the notification otherwise we can get device token his company account if has has company role
            if (partnerAccount?.deviceToken) {
              // notification for driver

              let targetLocale = partnerAccount?.app_locale || process.env.DEFAULT_LANGUAGE;
              let companyPartnerMessage = i18n.__({ phrase: "editTrip.notification.transferTripcompanyPartnerMessage", locale: targetLocale }, { driver_name: driver_name  , company_name: companyAgencyData?.company_name});

              let title = i18n.__({ phrase: "editTrip.notification.transferTripcompanyPartnerTitle", locale: targetLocale }, {company_name: companyAgencyData?.company_name});

              await this.sendNotification(
                                            partnerAccount?.deviceToken, companyPartnerMessage,
                                            title, 
                                            userInfo 
                                          );
            }

            if (partnerAccount?.webDeviceToken) {
              // notification for driver

              let targetLocale = partnerAccount?.web_locale || process.env.DEFAULT_LANGUAGE;
              let companyPartnerMessage = i18n.__({ phrase: "editTrip.notification.transferTripcompanyPartnerMessage", locale: targetLocale }, { driver_name: driver_name  , company_name: companyAgencyData?.company_name});

              let title = i18n.__({ phrase: "editTrip.notification.transferTripcompanyPartnerTitle", locale: targetLocale }, {company_name: companyAgencyData?.company_name});

              await this.sendNotification(
                                            partnerAccount?.webDeviceToken, companyPartnerMessage,
                                            title, 
                                            userInfo 
                                          );
            }
          }
        }
      }
     
    }

    return "done"
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error transferTripToCompanyAccount:', error.message);
    throw error;
  }
}

exports.sendBookingConfirmationEmail = async (tripDetail) => { 

  try {

    const companyDetails = await user_model.findOne({ _id: tripDetail?.created_by_company_id });
    const companyAgencyDetails = await AGENCY_MODEL.findOne({ user_id: tripDetail?.created_by_company_id });
    let email = tripDetail?.customerDetails?.email;
   
    let customerPhone = tripDetail?.customerDetails?.phone ? `+${tripDetail?.customerDetails?.countryCode} ${tripDetail?.customerDetails?.phone}`: '';

    const subject = `Trip Confirmation  ${tripDetail?.trip_id}`;

    const dateString = tripDetail?.pickup_date_time;
    const date = new Date(dateString);
    const bookingTrackLink = `${process.env.BASEURL}/ride/${tripDetail?.unique_trip_code}`
    const options = {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Amsterdam'
    };

    const formatted = date.toLocaleString('en-GB', options);

    // Remove " at " and split properly
    const formattedClean = formatted.replace(' at ', ' - ');

    const converteddateTimeValues = await this.convertToCustomFormat(tripDetail?.trip_from?.address , tripDetail?.pickup_date_time);
    const totalPrice = (tripDetail?.price + tripDetail?.child_seat_price + tripDetail?.payment_method_price).toFixed(2)
   
    const pickUpTime = converteddateTimeValues?.finalFormat ? converteddateTimeValues?.finalFormat : tripDetail?.pickup_date_time;
    const TimeZoneId =  converteddateTimeValues?.timeZone ?  converteddateTimeValues?.timeZone : "";

    const {city , country } = await getCityByPostcode(companyAgencyDetails?.post_code);
    const companyPhoneFormat =  await formatPhoneNumber(companyDetails?.countryCode , companyDetails?.phone)
    
    let bookingData = {
      trip_id: tripDetail?.trip_id,
      customerName: tripDetail?.customerDetails?.name,
      customerPhone: customerPhone,
      customerEmail: tripDetail?.customerDetails?.email,
      pickupTime: pickUpTime,
      TimeZoneId: TimeZoneId,
      departure: tripDetail?.trip_from?.address,
      arrival: tripDetail?.trip_to?.address,
      carType: tripDetail?.car_type,
      passengerCount: tripDetail?.passengerCount,
      fare: totalPrice,
      paymentOption: tripDetail?.pay_option,
      paymentMethodPrice: tripDetail?.payment_method_price,
      comment: tripDetail?.comment,
      childSeat: tripDetail?.child_seat_price,
      isChildSeat: tripDetail?.customerDetails?.childSeat,
      flightNo: tripDetail?.customerDetails?.flightNumber,
      luggage: tripDetail?.customerDetails?.luggage,
      driverRemark: tripDetail?.comment,
      companyName: companyAgencyDetails?.company_name,
      companyStreet: `${companyAgencyDetails?.land } ${companyAgencyDetails.house_number}` ,
      companyCity: city || "",
      companyCountry: companyAgencyDetails?.country || country,
      companyPostcode: companyAgencyDetails?.post_code,
      companyKvK: "",
      companyVat: "",
      companyWebsite: companyAgencyDetails?.website,
      companyEmail: companyDetails?.email,
      companyPhone: companyPhoneFormat?.standardFormat,
      companyLogoUrl: companyDetails?.logo,
      companyAddress: companyAgencyDetails?.house_number+" "+ companyAgencyDetails?.land,
      trackUrl: bookingTrackLink
    }
  
    // console.log('bookingData vijay--------' , bookingData)
    const emailSent = await sendEmail(
                                        email, // Receiver email
                                        subject, // Subject
                                        "send-booking-confirmation-email", // Template name (without .ejs extension)
                                        bookingData,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      )
    return emailSent

  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error sendBookingConfirmationEmail:', error.message);
    throw error;
  }
}

exports.convertToCustomFormat = async (address, utcDateTime) => {
  const timeZone = await this.getTimeZoneIdFromAddress(address , utcDateTime);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "long",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const parts = formatter.formatToParts(utcDateTime);
  const day = parts.find(p => p.type === 'day').value;
  const month = parts.find(p => p.type === 'month').value;
  const year = parts.find(p => p.type === 'year').value;
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;

  const finalFormat = `${day} ${month} ${year} - ${hour}:${minute}`;
  console.log(finalFormat , timeZone);
  return  { finalFormat , timeZone }
}

exports.getTimeZoneIdFromAddress = async (address , utcDateTime) => {

  if (utcDateTime instanceof Date) {
   
    utcDateTime = utcDateTime;
  } else if (typeof utcDateTime === "string") {
   
    utcDateTime = new Date(utcDateTime);
  } else {
    throw new Error("Invalid date input: must be a Date or ISO string");
  }

  console.log({address , utcDateTime})
  const geoRes = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${process.env.GOOGLE_MAP_KEY}`);
  const geoData = await geoRes.json();
  if (!geoData.results.length) throw new Error("Address not found");
  const { lat, lng } = geoData.results[0].geometry.location;

  const timestamp = Math.floor(utcDateTime.getTime() / 1000);
  const tzRes = await fetch(`https://maps.googleapis.com/maps/api/timezone/json?location=${lat},${lng}&timestamp=${timestamp}&key=${process.env.GOOGLE_MAP_KEY}`);
  const tzData = await tzRes.json();

  return tzData.status == "OK" ? tzData.timeZoneId : "";
  
}

exports.sendBookingCancelledEmail = async (tripDetail) => { 

  try {

    const companyDetails = await user_model.findOne({ _id: tripDetail?.created_by_company_id });
    const companyAgencyDetails = await AGENCY_MODEL.findOne({ user_id: tripDetail?.created_by_company_id });
    let email = tripDetail?.customerDetails?.email;
   
    const subject = `Your ride has been canceled # ${tripDetail?.trip_id}`;
    let customerPhone = tripDetail?.customerDetails?.phone ? `+${tripDetail?.customerDetails?.countryCode} ${tripDetail?.customerDetails?.phone}`: '';


    const dateString = tripDetail?.pickup_date_time;
    const date = new Date(dateString);

    const options = {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Amsterdam'
    };

    const formatted = date.toLocaleString('en-GB', options);

    // Remove " at " and split properly
    const formattedClean = formatted.replace(' at ', ' - ');

    const totalPrice = (tripDetail?.price + tripDetail?.child_seat_price + tripDetail?.payment_method_price).toFixed(2);

    const converteddateTimeValues = await this.convertToCustomFormat(tripDetail?.trip_from?.address , tripDetail?.pickup_date_time);
   
    const pickUpTime = converteddateTimeValues?.finalFormat ? converteddateTimeValues?.finalFormat : tripDetail?.pickup_date_time;
    const TimeZoneId =  converteddateTimeValues?.timeZone ?  converteddateTimeValues?.timeZone : "";
    const bookingTrackLink = `${process.env.BASEURL}/ride/${tripDetail?.unique_trip_code}`
    
    const {city , country } = await getCityByPostcode(companyAgencyDetails?.post_code);
    const companyPhoneFormat =  await formatPhoneNumber(companyDetails?.countryCode , companyDetails?.phone)

    let bookingData = {
      trip_id: tripDetail?.trip_id,
      customerName: tripDetail?.customerDetails?.name,
      customerPhone: customerPhone,
      customerEmail: tripDetail?.customerDetails?.email,
      pickupTime: pickUpTime,
      TimeZoneId: TimeZoneId,
      departure: tripDetail?.trip_from?.address,
      arrival: tripDetail?.trip_to?.address,
      carType: tripDetail?.car_type,
      passengerCount: tripDetail?.passengerCount,
      fare: totalPrice,
      paymentOption: tripDetail?.pay_option,
      paymentMethodPrice: tripDetail?.payment_method_price,
      childSeat: tripDetail?.child_seat_price,
      flightNo: tripDetail?.customerDetails?.flightNumber,
      driverRemark: tripDetail?.comment,
      companyName: companyAgencyDetails?.company_name,
      companyStreet: `${companyAgencyDetails?.land } ${companyAgencyDetails.house_number}` ,
      companyCity: city || "",
      companyCountry: companyAgencyDetails?.country || country,
      companyPostcode: companyAgencyDetails?.post_code,
      companyKvK: "",
      companyVat: "",
      companyWebsite: companyAgencyDetails?.website,
      companyEmail: companyDetails?.email,
      companyPhone: companyPhoneFormat?.standardFormat,
      companyLogoUrl: companyDetails?.logo,
      companyAddress: companyAgencyDetails?.house_number+" "+ companyAgencyDetails?.land,
      trackUrl: bookingTrackLink
    }

    const emailSent = await sendEmail(
                                        email, // Receiver email
                                        subject, // Subject
                                        "booking-cancel", // Template name (without .ejs extension)
                                        bookingData,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
  
    
    return emailSent

  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error sendBookingCancelledEmail:', error.message);
    throw error;
  }
}

exports.sendTripUpdateToCustomerViaSMS = async (tripDetail , smsEventType) => {
  try {

    if (!tripDetail?.customerDetails?.phone) return true; // if phone is  not availabe then functional will not continue ahead

    const companyDetail = await user_model.findById(tripDetail?.created_by_company_id)
    
    if (companyDetail?.sms_balance > process.env.SMS_CHARGE) { // check if compnay has enough balance to send an sms

      const companyAgencyDetail = await AGENCY_MODEL.findOne({user_id: tripDetail?.created_by_company_id});
      const id = tripDetail?._id;
      const companyId = tripDetail?.created_by_company_id;
      let  message = '';
      if (smsEventType == constant.SMS_EVENTS.TRIP_CREATE ) {
        message = `Booking confirmed with ${companyAgencyDetail?.company_name}. View details: ${process.env.BASEURL}/ride/${tripDetail?.unique_trip_code}`;
      } else if (smsEventType == constant.SMS_EVENTS.CHANGE_PICKUP_DATE_TIME) {
        message = `Trip updated. Details: ${process.env.BASEURL}/ride/${tripDetail?.unique_trip_code} - ${companyAgencyDetail?.company_name}`;
      } else if (smsEventType == constant.SMS_EVENTS.DRIVER_ON_THE_WAY) {
        message = `your driver from ${companyAgencyDetail?.company_name} is on the way. Track here: ${process.env.BASEURL}/ride/${tripDetail?.unique_trip_code}`;
      }
      
      let countryCode = tripDetail?.customerDetails?.countryCode.startsWith('+') ? tripDetail?.customerDetails?.countryCode :  `+${tripDetail?.customerDetails?.countryCode}`
      let phone = `${countryCode}${tripDetail?.customerDetails?.phone}`;
      
      const senderName = companyAgencyDetail?.company_name ?? "";
      const isSendSms    = await this.sendSms({to: phone , message:message , senderName:senderName , countryCode: countryCode});


      const smsTransactionData = {
        user_id: tripDetail?.created_by_company_id,
        trip_id: id,
        trip_no: tripDetail.trip_id,
        phone: phone,
        message_type: smsEventType,
        description: tripDetail?.trip_from?.address,
        cost_in_cents: process.env.SMS_CHARGE,
        status: isSendSms ? constant.SMS_STATUS.SENT : constant.SMS_STATUS.FAILED
      }

     
      const smsTransaction = await new SMS_TRANSACTION(smsTransactionData);
      await smsTransaction.save();

      if (isSendSms) {

        companyDetail.sms_balance = companyDetail?.sms_balance - process.env.SMS_CHARGE; // cut the sms money from company account
        await user_model.findOneAndUpdate({_id: companyDetail?._id} , {$set: {sms_balance: companyDetail?.sms_balance}}, { new: true })
       
        if (companyDetail.sms_balance < process.env.MINIMUM_SMS_BALANCE_ALERT) { // send an alert email when company sms balance will less than minimum balance
          this.notifyLowSmsBalance(tripDetail)
          console.log(`⚠️⚠️⚠️⚠️⚠️ Low SMS Balance Alert sent to company ID: ${companyDetail?.email}`);
        }
      }
    }
  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error sendTripUpdateToCustomerViaSMS:', error.message);
    throw error;
  }
}

exports.sendBookingUpdateDriverAllocationEmail = async (tripDetail) => { 

  try {

    const companyDetails = await user_model.findOne({ _id: tripDetail?.created_by_company_id });
    const companyAgencyDetails = await AGENCY_MODEL.findOne({ user_id: tripDetail?.created_by_company_id });
    let email = tripDetail?.customerDetails?.email;

    if (!tripDetail?.customerDetails?.email) return true;

    let subject = ``;

    subject = `Driver Confirmed for Your Booking: # ${tripDetail?.trip_id}`;
    
    
   let customerPhone = tripDetail?.customerDetails?.phone ? `+${tripDetail?.customerDetails?.countryCode} ${tripDetail?.customerDetails?.phone}`: '';

    const dateString = tripDetail?.pickup_date_time;
    const date = new Date(dateString);
    let driverName = ``;

    if (tripDetail?.driver_name) {

      const driverInfo = await driver_model.findById(tripDetail?.driver_name);
      driverName = driverInfo?.first_name ? driverInfo?.first_name : ``;
      driverName += driverInfo?.last_name.length > 2 ? ' '+driverInfo?.last_name.slice(0, 2) + "..." : '';
    }
    
 
    const options = {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Amsterdam'
    };

    const formatted = date.toLocaleString('en-GB', options);

    // Remove " at " and split properly
    const formattedClean = formatted.replace(' at ', ' - ');

    const converteddateTimeValues = await this.convertToCustomFormat(tripDetail?.trip_from?.address , tripDetail?.pickup_date_time);
    const totalPrice = (tripDetail?.price + tripDetail?.child_seat_price + tripDetail?.payment_method_price).toFixed(2)
   
    const pickUpTime = converteddateTimeValues?.finalFormat ? converteddateTimeValues?.finalFormat : tripDetail?.pickup_date_time;
    const TimeZoneId =  converteddateTimeValues?.timeZone ?  converteddateTimeValues?.timeZone : "";
    const {city , country } = await getCityByPostcode(companyAgencyDetails?.post_code);
    const companyPhoneFormat =  await formatPhoneNumber(companyDetails?.countryCode , companyDetails?.phone)

    let bookingData = {
      trip_id: tripDetail?.trip_id,
      customerName: tripDetail?.customerDetails?.name,
      customerPhone: customerPhone,
      customerEmail: tripDetail?.customerDetails?.email,
      pickupTime: pickUpTime,
      TimeZoneId: TimeZoneId,
      departure: tripDetail?.trip_from?.address,
      arrival: tripDetail?.trip_to?.address,
      carType: tripDetail?.car_type,
      passengerCount: tripDetail?.passengerCount,
      fare: totalPrice,
      paymentOption: tripDetail?.pay_option,
      paymentMethodPrice: tripDetail?.payment_method_price,
      childSeat: tripDetail?.child_seat_price,
      flightNo: tripDetail?.customerDetails?.flightNumber,
      driverRemark: tripDetail?.comment,
      driverName:driverName,
      companyName: companyAgencyDetails?.company_name,
      companyStreet: `${companyAgencyDetails?.land } ${companyAgencyDetails.house_number}` ,
      companyCity: city || "",
      companyCountry: companyAgencyDetails?.country || country,
      companyPostcode: companyAgencyDetails?.post_code,
      companyKvK: "",
      companyVat: "",
      companyWebsite: companyAgencyDetails?.website,
      companyEmail: companyDetails?.email,
      companyPhone: companyPhoneFormat?.standardFormat,
      companyLogoUrl: companyDetails?.logo,
      companyAddress: companyAgencyDetails?.house_number+" "+ companyAgencyDetails?.land,
      
    }

    const emailSent = await sendEmail(
                                        email, // Receiver email
                                        subject, // Subject
                                        "booking-update-driver-allocation", // Template name (without .ejs extension)
                                        bookingData,
                                        'en', //  for lanuguage
                                        [] // for attachment
                                      );
  
    return emailSent

  } catch (error) {
    console.log('❌❌❌❌❌❌❌❌❌Error sendBookingUpdateDriverAllocationEmail:', error.message);
    throw error;
  }
}

exports.sendBookingUpdateDateTimeEmail = async (tripDetail) => { 

  try {

    const companyDetails = await user_model.findOne({ _id: tripDetail?.created_by_company_id });
    const companyAgencyDetails = await AGENCY_MODEL.findOne({ user_id: tripDetail?.created_by_company_id });
    let email = tripDetail?.customerDetails?.email;

    if (!tripDetail?.customerDetails?.email) return true;

    let subject = ``;

    if (tripDetail?.trip_status == constant.TRIP_STATUS.REACHED) {
      subject = `Your Trip is Starting Soon – Driver En Route: # ${tripDetail?.trip_id}`;
    } else {
      subject = `Trip Rescheduled – Please Review New Details: # ${tripDetail?.trip_id}`;
    }
    
   let customerPhone = tripDetail?.customerDetails?.phone ? `+${tripDetail?.customerDetails?.countryCode} ${tripDetail?.customerDetails?.phone}`: '';

    const dateString = tripDetail?.pickup_date_time;
    const date = new Date(dateString);
    let driverName = ``;

    if (tripDetail?.driver_name) {

      const driverInfo = await driver_model.findById(tripDetail?.driver_name);
      driverName = driverInfo?.first_name ? driverInfo?.first_name : ``;
      driverName += driverInfo?.last_name.length > 2 ? ' '+driverInfo?.last_name.slice(0, 2) + "..." : '';
    }
    
 
    const options = {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Amsterdam'
    };

    const formatted = date.toLocaleString('en-GB', options);

    // Remove " at " and split properly
    const formattedClean = formatted.replace(' at ', ' - ');

    const converteddateTimeValues = await this.convertToCustomFormat(tripDetail?.trip_from?.address , tripDetail?.pickup_date_time);
    const totalPrice = (tripDetail?.price + tripDetail?.child_seat_price + tripDetail?.payment_method_price).toFixed(2)
   
    const pickUpTime = converteddateTimeValues?.finalFormat ? converteddateTimeValues?.finalFormat : tripDetail?.pickup_date_time;
    const TimeZoneId =  converteddateTimeValues?.timeZone ?  converteddateTimeValues?.timeZone : "";
    const bookingTrackLink = `${process.env.BASEURL}/ride/${tripDetail?.unique_trip_code}`
    
    const {city , country } = await getCityByPostcode(companyAgencyDetails?.post_code);
    const companyPhoneFormat =  await formatPhoneNumber(companyDetails?.countryCode , companyDetails?.phone)

    let bookingData = {
      trip_id: tripDetail?.trip_id,
      customerName: tripDetail?.customerDetails?.name,
      customerPhone: customerPhone,
      customerEmail: tripDetail?.customerDetails?.email,
      pickupTime: pickUpTime,
      TimeZoneId: TimeZoneId,
      departure: tripDetail?.trip_from?.address,
      arrival: tripDetail?.trip_to?.address,
      carType: tripDetail?.car_type,
      passengerCount: tripDetail?.passengerCount,
      fare: totalPrice,
      paymentOption: tripDetail?.pay_option,
      paymentMethodPrice: tripDetail?.payment_method_price,
      comment: tripDetail?.comment,
      childSeat: tripDetail?.child_seat_price,
      isChildSeat: tripDetail?.customerDetails?.childSeat,
      flightNo: tripDetail?.customerDetails?.flightNumber,
      luggage: tripDetail?.customerDetails?.luggage,
      driverRemark: tripDetail?.comment,
      companyName: companyAgencyDetails?.company_name,
      companyStreet: `${companyAgencyDetails?.land } ${companyAgencyDetails.house_number}` ,
      companyCity: city || "",
      companyCountry: companyAgencyDetails?.country || country,
      companyPostcode: companyAgencyDetails?.post_code,
      companyKvK: "",
      companyVat: "",
      companyWebsite: companyAgencyDetails?.website,
      companyEmail: companyDetails?.email,
      companyPhone: companyPhoneFormat?.standardFormat,
      companyLogoUrl: companyDetails?.logo,
      companyAddress: companyAgencyDetails?.house_number+" "+ companyAgencyDetails?.land,
      trackUrl: bookingTrackLink,
      driverName:driverName
    } 

    const emailSent = await sendEmail(email, // Receiver email
                                      subject, // Subject
                                      "send-booking-update-email", // Template name (without .ejs extension)
                                      bookingData,
                                      'en', //  for lanuguage
                                      [] // for attachment
                                    )

    return emailSent

  } catch (error) {

    console.log("❌❌❌❌❌❌❌❌❌Error sendBookingUpdateDateTimeEmail:",  error.message);
    throw error;
  }
}


exports.informCustomerDriverOnTheWay = async (tripDetail) => { 

  try {

    const companyDetails = await user_model.findOne({ _id: tripDetail?.created_by_company_id });
    const companyAgencyDetails = await AGENCY_MODEL.findOne({ user_id: tripDetail?.created_by_company_id });
    let email = tripDetail?.customerDetails?.email;

    if (!tripDetail?.customerDetails?.email) return true;
    
    const subject = `Important: Your Trip Details Have Been Updated # ${tripDetail?.trip_id}`;

    const dateString = tripDetail?.pickup_date_time;
    const date = new Date(dateString);

    const options = {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Europe/Amsterdam'
    };

    const formatted = date.toLocaleString('en-GB', options);

    // Remove " at " and split properly
    const formattedClean = formatted.replace(' at ', ' - ');

    const pickUpTime = `${formattedClean} hour`;
   
    const bodyHtml =  `
                       <style>
                        body {
                          font-family: Arial, sans-serif;
                          color: #333;
                          padding: 20px;
                        }
                        .container {
                          max-width: 600px;
                          margin: auto;
                          border: 1px solid #ddd;
                          padding: 20px;
                          border-radius: 8px;
                        }
                        h2 {
                          color: #007BFF;
                        }
                        table {
                          width: 100%;
                          margin-top: 20px;
                          border-collapse: collapse;
                        }
                        td {
                          padding: 8px 0;
                        }
                        .footer {
                          margin-top: 30px;
                          font-size: 14px;
                          color: #555;
                        }
                      </style>
                      <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
                      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden;">
                        <tr>
                          <td style="background-color: #007BFF; color: #ffffff; padding: 20px; text-align: center;">
                            <h2 style="margin: 0;">Your Driver Is On the Way</h2>
                          </td>
                        </tr>
                        <tr>
                          <td style="padding: 30px;">
                            <p>Hi <strong>${tripDetail?.customerDetails?.name}</strong>,</p>
                            <p>Your driver is currently on the way to pick you up for your scheduled trip (${tripDetail?.trip_id}) with <strong>${companyAgencyDetails?.company_name}</strong>.</p>
                            <p>Please be ready at your pickup location.</p>
                            <p>Thank you for choosing <strong>${companyAgencyDetails?.company_name}</strong>!</p>
                            <br>
                            <p style="color: #555;">Need help? Contact our support team at <a href="mailto: ${process.env.SUPPORT_EMAIL}"> ${process.env.SUPPORT_EMAIL}</a>.</p>
                          </td>
                        </tr>
                        
                      </table>
                    </body>


                    `;
    let template = ` ${bodyHtml}`
  
    var transporter = nodemailer.createTransport(emailConstant.credentials);
    var mailOptions = {
                        from: emailConstant.from_email,
                        to: email,
                        subject: subject,
                        html: template
                      };
    let sendEmail = await transporter.sendMail(mailOptions);
    return sendEmail

  } catch (error) {

    console.log("❌❌❌❌❌❌❌❌❌Error informCustomerDriverOnTheWay:",  error.message);
    throw error;
  }
}

exports.notifyLowSmsBalance = async (userDetails) => {
  try {

    const companyDetails = await user_model.findOne({ _id: userDetails?.created_by_company_id });
    const companyAgencyDetails = await AGENCY_MODEL.findOne({ user_id: userDetails?.created_by_company_id });
    let email = companyDetails?.email;
    
    const subject = `Low SMS Balance Alert – Action Required`;

    const data = {
                  companyName: companyAgencyDetails?.company_name,
                  minimumBalance: process.env.MINIMUM_SMS_BALANCE_ALERT / 100,
                  baseUrl: process.env.BASEURL,
                  supportEmail: process.env.SUPPORT_EMAIL
                }

    const emailSent = await sendEmail(
                                      email, // Receiver email
                                      subject, // Subject
                                      "notify-low-sms-balance", // Template name (without .ejs extension)
                                      data,
                                      'en', //  for lanuguage
                                      [] // for attachment
                                    );
  
    return emailSent
  } catch (error) {

    console.log("❌❌❌❌❌❌❌❌❌Error notifyLowSmsBalance:",  error.message);
    throw error;
  }
}

exports.getLatLng = async (location) => {

  try {

    const encodedAddress = encodeURIComponent(location);
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${process.env.GOOGLE_MAP_KEY}`;

    const res = await axios.get(url);
    if (res.data.status === 'OK') {
      return res.data.results[0].geometry.location;
    }

  } catch (error) {

    console.log("❌❌❌❌❌❌❌❌❌Error getLatLng:",  error.message);
    throw error;
  }
}

// based on address
exports.getDistanceAndDuration = async (origin, destination) => {

 try {
  
  origin = origin || '';
  destination = destination || '';
  
  const encodedOrigin = encodeURIComponent(origin);
    const encodedDestination = encodeURIComponent(destination);
  // const originLatLng = await this.getLatLng(origin);
  // const destLatLng = await this.getLatLng(destination);
  // const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${originLatLng.lat},${originLatLng.lng}&destinations=${destLatLng.lat},${destLatLng.lng}&mode=driving&key=${process.env.GOOGLE_MAP_KEY}`;
  const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodedOrigin}&destinations=${encodedDestination}&mode=driving&key=${process.env.GOOGLE_MAP_KEY}`;
  console.log(url)
      const response = await axios.get(url);
      
      const element = response.data.rows[0].elements[0];
      return element;
  } catch (error) {

    console.log("❌❌❌❌❌❌❌❌❌Error getDistanceAndDuration:",  error.message);
    throw error;
  }
}

// based on lat long
exports.getDistanceAndDurationFromlatLong = async (pickupLat, pickupLng , dropLat , dropLng) => {

  try {
  
    const origin = `${pickupLat},${pickupLng}`;
    const destination = `${dropLat},${dropLng}`;
    
    const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${origin}&destinations=${destination}&mode=driving&units=imperial&departure_time=now&key=${process.env.GOOGLE_MAP_KEY}`;
    console.log(url)
      const response = await axios.get(url);
      
      const element = response?.data?.rows?.[0]?.elements?.[0];
      return element;
  } catch (error) {

    console.log("❌❌❌❌❌❌❌❌❌Error getDistanceAndDuration:",  error.message);
    throw error;
  }
}

//  2 minutes will be applied for customer cancel timing if no value find in company settings 
exports.canCustomerCancelTrip = (tripDetails, cancelWindowMinutes = CONSTANT.CUSTOMER_CANCEL_TIMING_TRIP, now = new Date()) => {
  const start = new Date(tripDetails?.pickup_date_time);              // Mongo stores UTC; Date compares in UTC internally
  const msLeft = start.getTime() - now.getTime(); // positive if in future
  const minutesLeft = Math.floor(msLeft / 60000);
  const required = cancelWindowMinutes;

  return {
    isAllowed: minutesLeft >= required,             
    minutesLeft
  };
}

exports.generateInvoiceReceipt = async (stripeCustomerId , tripDetail , isInvoiceForCompany = true) => {

  
  // 1. Create the invoice
  const invoice = await stripe.invoices.create({
                                                customer: stripeCustomerId,
                                                collection_method: 'send_invoice',
                                                days_until_due: 0,
                                                custom_fields: [
                                                  // { name: 'Company Name', value: 'Doe Solutions B.V.' },
                                                  // { name: 'Father’s Name', value: 'Mr. Richard Doe' },
                                                ],
                                                footer: 'Thanks for your business.',
                                              });

          
  let  amount = 0; 
  
  if (isInvoiceForCompany) {
    amount = tripDetail?.companyPaymentAmount.toFixed(0); 
  } else {
     
    amount = ((tripDetail?.price || 0) - (tripDetail?.driverPaymentAmount || 0) + (tripDetail?.child_seat_price || 0) + (tripDetail?.payment_method_price || 0)).toFixed(0);
  }

  await stripe.invoiceItems.create({
                                    customer: stripeCustomerId,
                                    invoice: invoice.id, // 🔥 attach this item to the specific invoice
                                    amount: Number(amount) * 100, // €100.00
                                    currency: 'eur',
                                    description: `${tripDetail?.trip_id}`,
                                    tax_rates: [process.env.STRIPE_VAT_TAX_ID],
                                  });

  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
  // 5. Mark it as paid (only works for invoices not paid via Stripe directly)

  let  invoiceDetail = await stripe.invoices.retrieve(invoice.id);

  if (invoiceDetail.status !== 'paid') {

     const paidInvoice = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true, });
  }
 
  invoiceDetail = await stripe.invoices.retrieve(invoice.id);
  return invoiceDetail
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
