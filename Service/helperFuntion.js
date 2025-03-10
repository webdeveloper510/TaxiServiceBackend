require("dotenv").config();
const jwt = require("jsonwebtoken");
const User = require("../models/user/user_model");
const driver_model = require("../models/user/driver_model");
const user_model = require("../models/user/user_model");
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
      console.error('Error attaching bank account :', error);
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
      console.error("Error creating account:", error);
      throw error;
  }
};

// User onboard's link for stripe after custom account creation
exports.stripeOnboardingAccountLink = async (accountId , user_id) => {
  try {
      const accountLink = await stripe.accountLinks.create({
          account: accountId,
          refresh_url: `https://idispatch.nl/bank-account-verification-pending/${user_id}`,
          return_url: `https://idispatch.nl/bank-account-verification-completed/${user_id}`,
          type: 'account_onboarding',
      });

      console.log("Onboarding Link:", accountLink.url);
      return accountLink.url;
  } catch (error) {
      console.error("Error creating account link:", error);
  }
};

// User onboard's link for stripe after custom account creation
exports.getConnectedAccountDetails = async (accountId) => {
  try {

    const account = await stripe.accounts.retrieve(accountId);
    console.log("Account Details:", account);
    return account;
  } catch (error) {
      console.error("Error creating account link:", error);
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
      console.error('Error updating bank account:', error.message);
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
      console.error('Error sending payout:', error);
      throw error;
  }
}

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
  
  if (companyData?.socketId) {
    await io.to(companyData?.socketId).emit("noShow", { message , trip_data } )
  }

  // Informed to the company when driver didn't  find the  customer  on pickup location
  if (companyData?.deviceToken) {
    this.sendNotification(companyData?.deviceToken , message , 'NO SHOW CUSTOMER' , {})
  }

  if (companyData?.webSocketId) {
    
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

exports.emailHeader = async () => {

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
                              <html xmlns="http://www.w3.org/1999/xhtml"><head><meta content="text/html; charset=utf-8" http-equiv="Content-Type"><meta content="width=device-width, initial-scale=1" name="viewport"><title>Reset your password</title><!-- Designed by https://github.com/kaytcat --><!-- Robot header image designed by Freepik.com --><style type="text/css">
                              @import url(https://fonts.googleapis.com/css?family=Nunito);
                            
                              /* Take care of image borders and formatting */
                            
                              img {
                                max-width: 600px;
                                outline: none;
                                text-decoration: none;
                                -ms-interpolation-mode: bicubic;
                              }
                              html{
                                margin: 0;
                                padding:0;
                              }
                            
                              a {
                                text-decoration: none;
                                border: 0;
                                outline: none;
                                color: #bbbbbb;
                              }
                            
                              a img {
                                border: none;
                              }
                            
                              /* General styling */
                            
                              td, h1, h2, h3  {
                                font-family: Helvetica, Arial, sans-serif;
                                font-weight: 400;
                              }
                            
                              td {
                                text-align: center;
                              }
                            
                              body {
                                -webkit-font-smoothing:antialiased;
                                -webkit-text-size-adjust:none;
                                width: 100%;
                                height: 100%;
                                color: #666;
                                background: #fff;
                                font-size: 16px;
                                width: 100%;
                                padding: 0px;
                                margin: 0px;
                              }
                            
                              table {
                                border-collapse: collapse !important;
                              }
                            
                              .headline {
                                color: #444;
                                font-size: 36px;
                                    padding-top: 10px;
                              }
                            
                            .force-full-width {
                              width: 100% !important;
                            }
                            
                            
                              </style><style media="screen" type="text/css">
                                  @media screen {
                                    td, h1, h2, h3 {
                                      font-family: 'Nunito', 'Helvetica Neue', 'Arial', 'sans-serif' !important;
                                    }
                                  }
                              </style><style media="only screen and (max-width: 480px)" type="text/css">
                                /* Mobile styles */
                                @media only screen and (max-width: 480px) {
                            
                                  table[class="w320"] {
                                    width: 320px !important;
                                  }
                                }
                              </style>
                              <style type="text/css"></style>
                              
                              </head>
                              <body bgcolor="#fff" class="body" style="padding:0px; margin:0; display:block; background:#fff;">
                              `;

}

exports.emailFooter = async () => {

  return `</body></html>`;
}

exports.sendPaymentFailEmail = async (subsctiptionId , reseon) => {

  
  let subscriptionDetails = await SUBSCRIPTION_MODEL.findOne({subscriptionId: subsctiptionId}).populate('purchaseByCompanyId').populate('purchaseByDriverId');
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
                                  <span style="font-weight:bold;">Attempted Amount: </span> €${subscriptionDetails.amount}
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
                              If you have any questions or require assistance during this process, please do not hesitate to reach out to our support team at ${emailConstant.from_email}. We are here to help!
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
 
  const currentDate = new Date();

  // Get day, month, and year
  const day = String(currentDate.getDate()).padStart(2, '0'); // Add leading zero if needed
  const month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are 0-based, add 1 and pad
  const year = String(currentDate.getFullYear()); // Get last two digits of the year

  // Format date as dd mm yy
  const formattedDate = `${day}-${month}-${year}`;
  const subject = `Welcome to ${UserName} – Subscription Activated`
  const bodyHtml =  `
                      <p>
                          Dear ${UserName},
                          <br><br>
                          We are thrilled to welcome you to Idispatch Mobility! Your subscription has been successfully activated, and you can now enjoy all the benefits of your ${planDetails.name}.
                          
                          <br><br>
                          
                          <span style="font-weight:bold;">Subscription Details:</span>
                          
                          <br><br>

                          <ul>
                            <li> <span style="font-weight:bold;">Subscription ID:</span> ${subsctiptionId}</li>
                            <li> <span style="font-weight:bold;">Plan Name:</span> ${planDetails.name}</li>
                            <li> <span style="font-weight:bold;">Start Date:</span> ${subscriptionDetails.startPeriod}</li>
                            <li> <span style="font-weight:bold;">Next Billing Date:</span> ${subscriptionDetails.endPeriod} </li>
                            <li> <span style="font-weight:bold;">Amount Charged:</span> ${subscriptionDetails.amount} + (21% VAT)</li>
                          </ul>

                          <br><br>
                          Thank you for choosing Idispatch Mobility. We're excited to have you with us and look forward to delivering an amazing experience!

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
                      attachments: [
                        {
                            filename: `${subscriptionDetails.invoiceName}.pdf`,  // Change filename as needed
                            path: `${subscriptionDetails.invoicePdfUrl}`,  // Provide the correct path to the file
                            contentType: 'application/pdf' // Set appropriate content type
                        }
                      ]
                    };
  let sendEmail = await transporter.sendMail(mailOptions);
  return sendEmail
}

exports.sendEmailMissingInfoStripeOnboaring = async (accountId , missingFields) => {

  let userCondition = {connectedAccountId : accountId}
  const userDetail = await user_model.findOne(userCondition);
  const formattedFields = missingFields.map(field => `<li>${field}</li>`).join("");
  const onboardingLink = await this.stripeOnboardingAccountLink(accountId)
  const subject = `Action Required: Complete Your Stripe Account Setup`;
  let toEmail = userDetail?.email;
  const bodyHtml =  `
                      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                          <h2 style="color: #333;">Hi ${userDetail?.first_name} ${userDetail?.last_name},</h2>
                          <p>We noticed that your Stripe account setup is incomplete. To start receiving payments, you need to provide some missing information.</p>
                          
                          <h3 style="color: #ff4d4d;">Required Information:</h3>
                          <ul>${formattedFields}</ul>
                          
                          <p>Please update your details as soon as possible to avoid any disruptions.</p>
                          
                          <p><a href="${onboardingLink}" style="display: inline-block; padding: 10px 15px; color: white; background-color: #007bff; text-decoration: none; border-radius: 5px;">
                              Complete Your Setup
                          </a></p>

                          <p>If you have any questions, feel free to reach out.</p>
                          <p>Best regards, <br><strong>Idispatch Mobility</strong></p>
                      </div>
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

exports.sendEmailDriverCreation = async (driverInfo , randomPasword) => {

  let bodyHtml = ``;

  if (randomPasword ) {

    bodyHtml =  `
                <table align="center" cellpadding="0" cellspacing="0" height="100%" width="600px" style="margin-top: 30px;margin-bottom: 10px;border-radius: 10px;box-shadow: 0px 1px 4px 0px rgb(0 0 0 / 25%);background:#ccc;">
                <tbody><tr>
                <td align="center" bgcolor="#fff" class="" valign="top" width="100%">
                <center class=""><table cellpadding="0" cellspacing="0" class="w320" style="margin: 0 auto;" width="600">
                <tbody><tr>
                <td align="center" class="" valign="top">
                <table bgcolor="#fff" cellpadding="0" cellspacing="0" class="" style="margin: 0 auto; width: 100%; margin-top: 0px;">
                <tbody style="margin-top: 5px;">
                  <tr class="" style="border-bottom: 1px solid #cccccc38;">
                <td class="">
                </td>
                </tr>
                <tr class=""><td class="headline">Welcome to iDispatch!</td></tr>
                <tr>
                <td>
                <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                <td class="" style="color:#444; font-weight: 400;"><br>
                <br><br>
                Welcome to iDispatch!

                You have successfully been registered to use iDispatch.
                <br>
                  Your login credentials are provided below:
                <br>
                <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${driverInfo.email}</span>
                <br>
                <span style="font-weight:bold;">Password: &nbsp;</span><span style="font-weight:lighter;" class="">${randomPasword}</span>
                
                <br><br>
                <br></td>
                </tr>
                </tbody></table></center>
                </td>
                </tr>
                <tr>
                <td class="">
                <div class="">
                <a style="background-color:#ffcc54;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="https://idispatch.nl/login">Visit Account and Start Managing</a>
                </div>
                <br>

                <p>
                  Your password has been automatically generated. However, you may update it at any time from your account settings.
                </p>
                </td>
                </tr>
                </tbody>

                  </table>
              `;
  } else {
    
     bodyHtml =  `
                  <table align="center" cellpadding="0" cellspacing="0" height="100%" width="600px" style="margin-top: 30px;margin-bottom: 10px;border-radius: 10px;box-shadow: 0px 1px 4px 0px rgb(0 0 0 / 25%);background:#ccc;">
                  <tbody><tr>
                  <td align="center" bgcolor="#fff" class="" valign="top" width="100%">
                  <center class=""><table cellpadding="0" cellspacing="0" class="w320" style="margin: 0 auto;" width="600">
                  <tbody><tr>
                  <td align="center" class="" valign="top">
                  <table bgcolor="#fff" cellpadding="0" cellspacing="0" class="" style="margin: 0 auto; width: 100%; margin-top: 0px;">
                  <tbody style="margin-top: 5px;">
                    <tr class="" style="border-bottom: 1px solid #cccccc38;">
                  <td class="">
                  </td>
                  </tr>
                  <tr class=""><td class="headline">Welcome to iDispatch!</td></tr>
                  <tr>
                  <td>
                  <center class=""><table cellpadding="0" cellspacing="0" class="" style="margin: 0 auto;" width="75%"><tbody class=""><tr class="">
                  <td class="" style="color:#444; font-weight: 400;"><br>
                  <br><br>
                  Welcome to iDispatch!

                  We're pleased to inform you that Step 1 of your registration is successfully completed. Next in line is Step 2, where we kindly ask you to upload necessary details and documents. Following this, our team will promptly review your submission.<br>
                  <br>
                    Your login credentials are provided below:
                  <br>
                  <span style="font-weight:bold;">Email: &nbsp;</span><span style="font-weight:lighter;" class="">${driverInfo.email}</span>
                  <br>
                  <br><br>
                  <br></td>
                  </tr>
                  </tbody></table></center>
                  </td>
                  </tr>
                  <tr>
                  <td class="">
                  <div class="">
                  <a style="background-color:#ffcc54;border-radius:4px;color:#fff;display:inline-block;font-family:Helvetica, Arial, sans-serif;font-size:18px;font-weight:normal;line-height:50px;text-align:center;text-decoration:none;width:350px;-webkit-text-size-adjust:none;" href="https://idispatch.nl/login">Visit Account and Start Managing</a>
                  </div>
                  <br>
                  </td>
                  </tr>
                  </tbody>

                    </table>

                  <table bgcolor="#fff" cellpadding="0" cellspacing="0" class="force-full-width" style="margin: 0 auto; margin-bottom: 5px:">
                  <tbody>
                  <tr>
                  <td class="" style="color:#444;
                                      ">
                  <p>The password was auto-generated, however feel free to change it

                      <a href="" style="text-decoration: underline;">
                        here</a>

                    </p>
                    </td>
                  </tr>
                  </tbody></table></td>
                  </tr>
                  </tbody></table></center>
                  </td>
                  </tr>
                  </tbody></table>
                `;
  }
  
  let template = ` ${bodyHtml}`

  var transporter = nodemailer.createTransport(emailConstant.credentials);
  var mailOptions = {
                      from: emailConstant.from_email,
                      to: driverInfo.email,
                      subject: `Welcome mail`,
                      html: `${await this.emailHeader()} ${template} ${await this.emailFooter()}`,
                    };
  let sendEmail = await transporter.sendMail(mailOptions);
  return sendEmail
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

// get the trip that has been completed before 1 week
exports.getPendingPayoutTripsBeforeWeek = async () => {
  try {

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 2);
    const trips = await TRIP_MODEL.aggregate([
                                              {
                                                $match: { 
                                                          is_paid: true,
                                                          pickup_date_time: { $lt: sevenDaysAgo },
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
                                                  "companyDetails.connectedAccountId": 1,
                                                  "companyDetails.email": 1,
                                                }
                                              }
                                            ]);

    return trips
  } catch (error) {
    console.error("Error retrieving balance:", error);
    throw error;
  }
}

exports.transferToConnectedAccount = async (amount, connectedAccountId , tripId) => {

  try {

    const transfer = await stripe.transfers.create({
                                                    amount: Math.round(amount * 100), // Amount in cents (e.g., $10 = 1000) 
                                                    currency: "eur",
                                                    destination: connectedAccountId, // Connected account ID
                                                    transfer_group: tripId, // Optional: Group for tracking
                                                  });

    console.log("Transfer Successful:---------", transfer);
    return transfer;
  } catch (error) {
    console.error("Error Transfer balance:", error.message);
    throw error;
  }
}


exports.sendPayoutToBank = async (amount, connectedAccountId) => {

  try {

    const payout = await stripe.payouts.create(
                                                {
                                                  amount: Math.round(amount * 100), // Amount in cents
                                                  currency: "eur",
                                                },
                                                {
                                                  stripeAccount: connectedAccountId, // Specify connected account
                                                }
                                              );

    console.log("Payout Successful:", payout);
    return payout;
  } catch (error) {

    console.error("Error sendPayoutToBank balance:",  error.message);
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

    console.error("Error checkPayouts status:",  error.message);
    throw error;
  }
}

exports.notifyInsufficientBalance = async () => {

  try{

    let emails = await user_model.find({ role: CONSTANT.ROLES.SUPER_ADMIN }).distinct("email"); // Returns an array of unique email addresses directly.
    emails = emails.join(",");
   
    const subject = `Insufficient Balance Alert – Action Required`;
   
    const bodyHtml =  `
                        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                            <h2>Dear <span  style="color: #333;">Admin </span>,</h2>
                            <p>We hope this email finds you well.</p>
                            <p>We attempted to process a payout, but it could not be completed due to <b>insufficient balance</b> in your account. Please ensure that you have sufficient funds available to proceed with the transaction.</p>
                            <p>To avoid any service disruptions, please deposit the required amount and retry the transaction. If you need assistance, feel free to contact our support team.</p>
                            <p>Best regards, <br><strong>Idispatch Mobility</strong></p>
                        </div>
                    `;
    let template = ` ${bodyHtml}`
  
    var transporter = nodemailer.createTransport(emailConstant.credentials);
    var mailOptions = {
                        from: emailConstant.from_email,
                        to: emails,
                        subject: subject,
                        html: template
                      };
    let sendEmail = await transporter.sendMail(mailOptions);
    return sendEmail
    
  } catch (error) {

    console.error("Error checkPayouts status:",  error.message);
    throw error;
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
