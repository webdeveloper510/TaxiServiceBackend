require("dotenv").config();
const TRIP_MODEL = require("../models/user/trip_model.js");
const USER_MODEL = require("../models/user/user_model");
const DRIVER_MODEL = require("../models/user/driver_model");
const AGENCY_MODEL = require("../models/user/agency_model.js");;
const CONSTANT = require("../config/constant.js");
const SETTING_MODEL = require('../models/user/setting_model')
const i18n = require('../i18n');
const {  sendNotification } = require("./helperFuntion");

exports.sendPreTripNotifications =  async () => {

    try {
        const currentDate = new Date();
        // const fifteenMinutesBefore = new Date(currentDate.getTime() + 15 * 60000); // Add 15 minutes in milliseconds  console.log("🚀 ~ checkTripsAndSendNotifications ~ fifteenMinutesBefore:", fifteenMinutesBefore)
        // const thirteenMinutesBefore = new Date(currentDate.getTime() + 13 * 60000);

        let fifteenMinutesBefore = new Date(currentDate.getTime() + 15 * 60000); // Add 15 minutes in milliseconds  console.log("🚀 ~ checkTripsAndSendNotifications ~ fifteenMinutesBefore:", fifteenMinutesBefore)
        let thirteenMinutesBefore = new Date(currentDate.getTime() + 13 * 60000);

        const { startDateTime, endDateTime  , currentDateTime} = await this.get20thMinuteRangeUTC();
        // fifteenMinutesBefore = new Date(endDateTime);
        // thirteenMinutesBefore = new Date(startDateTime);

        const trips = await TRIP_MODEL.find({
                                                pickup_date_time: {$gte: (startDateTime), $lte: endDateTime },
                                                // pickup_date_time: { $gte: thirteenMinutesBefore },
                                                fifteenMinuteNotification: false,
                                                driver_name: { $ne: null }
                                            })
                                            .populate([
                                                        { path: "driver_name" }, 
                                                        { path: "created_by_company_id" }
                                                    ]);
        const notifications = [];
        const ids = [];

        for(let trip of trips) {
            ids.push(trip._id)
            let companyAgecnyData = await AGENCY_MODEL.findOne({user_id: trip?.created_by_company_id});

            // send to trip's driver app
            if (trip?.driver_name?.deviceToken) {
                
                let targetLocale = trip?.driver_name?.app_locale || process.env.DEFAULT_LANGUAGE;
                let driverNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
    
                let driverNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
                sendNotification( trip?.driver_name?.deviceToken, driverNotificationMessage, driverNotificationTitle, trip )
            }

            // send to trip's driver web
            if (trip?.driver_name?.webDeviceToken) {
                    
                let targetLocale = trip?.driver_name?.web_locale || process.env.DEFAULT_LANGUAGE;
                let driverNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
        
                let driverNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
                sendNotification( trip?.driver_name?.webDeviceToken, driverNotificationMessage, driverNotificationTitle, trip )
            }
            
            // send to trip's company app
            if (trip.created_by_company_id?.deviceToken) {
                
                let targetLocale = trip?.created_by_company_id?.app_locale || process.env.DEFAULT_LANGUAGE;
                let companyNotificationMessage = i18n.__({ phrase: "editTrip.notification.companyPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
        
                let companyNotificationTitle = i18n.__({ phrase: "editTrip.notification.companyPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
        
                sendNotification( trip.created_by_company_id?.deviceToken, companyNotificationMessage, companyNotificationTitle, trip )
            }

            // send to trip's company web
            if (trip.created_by_company_id?.webDeviceToken) {
                
                let targetLocale = trip?.created_by_company_id?.web_locale || process.env.DEFAULT_LANGUAGE;
                let companyNotificationMessage = i18n.__({ phrase: "editTrip.notification.companyPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
        
                let companyNotificationTitle = i18n.__({ phrase: "editTrip.notification.companyPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
        
                sendNotification( trip.created_by_company_id?.webDeviceToken, companyNotificationMessage, companyNotificationTitle, trip )
            }

            // functionality for the drivers who have account access as partner
            const driverHasCompanyPartnerAccess = await DRIVER_MODEL.find({
                                                                                parnter_account_access  :   {
                                                                                                                $elemMatch: { company_id: new mongoose.Types.ObjectId(trip?.created_by_company_id) },
                                                                                                            },
                                                                            });
            if (driverHasCompanyPartnerAccess){
            
                for (let partnerAccount of driverHasCompanyPartnerAccess) {
                    if (partnerAccount?.deviceToken) {
        
                        let targetLocale = partnerAccount?.app_locale || process.env.DEFAULT_LANGUAGE;
                        let driverPartnerAccountNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPartnerAccountPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
            
                        let driverPartnerAccountNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPartnerAccountPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
                    
                        await sendNotification( partnerAccount?.deviceToken, driverPartnerAccountNotificationMessage, driverPartnerAccountNotificationTitle, trip )
                    }
        
                    if (partnerAccount?.webDeviceToken) {
            
                        let targetLocale = partnerAccount?.web_locale || process.env.DEFAULT_LANGUAGE;
                        let driverPartnerAccountNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPartnerAccountPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
            
                        let driverPartnerAccountNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPartnerAccountPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
                    
                        await sendNotification( partnerAccount?.webDeviceToken, driverPartnerAccountNotificationMessage, driverPartnerAccountNotificationTitle, trip )
                    }
                }
            }

            // functionality for the drivers who have account access as partner
            const driverHasCompanyAccess =  await DRIVER_MODEL.find({
                                                                        company_account_access  :   {
                                                                                                        $elemMatch: { company_id: new mongoose.Types.ObjectId(trip?.created_by_company_id) },
                                                                                                    },
                                                                    });

            if (driverHasCompanyAccess){
            
                for (let accountAccess of driverHasCompanyAccess) {
                    if (accountAccess?.deviceToken) {
                    
                        let targetLocale = accountAccess?.app_locale || process.env.DEFAULT_LANGUAGE;
                        let driverCompanyAccountNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverCompanyAccountPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
            
                        let driverCompanyAccountNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverCompanyAccountPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
                        await sendNotification( accountAccess?.deviceToken, driverCompanyAccountNotificationMessage, driverCompanyAccountNotificationTitle, trip )
                    }
        
                    if (accountAccess?.webDeviceToken) {
        
                        let targetLocale = accountAccess?.web_locale || process.env.DEFAULT_LANGUAGE;
                        let driverCompanyAccountNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverCompanyAccountPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
            
                        let driverCompanyAccountNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverCompanyAccountPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
                        await sendNotification( accountAccess?.webDeviceToken, driverCompanyAccountNotificationMessage, driverCompanyAccountNotificationTitle, trip )
                    }
                }
            }
        }

        await TRIP_MODEL.updateMany(
                                        { _id: { $in: ids } },
                                        {
                                          $set: {
                                            fifteenMinuteNotification: true,
                                          },
                                        }
                                      );
    } catch (error) {
    console.log("Error sendPreTripNotifications--cron:", error);
    // throw error;
  }
}

exports.get20thMinuteRangeUTC = async () => {

  const adminPrepreNotificationTime = await SETTING_MODEL.findOne({key: CONSTANT.ADMIN_SETTINGS.PRE_NOTIFICATION_TIME});

  const preNotificationTime = parseInt(parseFloat(adminPrepreNotificationTime.value))
  let currentTime = new Date();

  let currentDateTime = new Date();
  
  currentDateTime.setUTCHours(currentDateTime.getUTCHours());
  currentDateTime.setUTCMinutes(currentDateTime.getUTCMinutes());

  currentDateTime = currentDateTime.toISOString();
  // Add 15 minutes to the current time
  let futureTime = new Date(currentTime.getTime() + preNotificationTime * 60 * 1000);
  // console.log(currentDateTime)
  // console.log(futureTime)
  
  // Set the start time at the 15th minute in UTC with 0 seconds and 0 milliseconds
  let startDateTime = new Date(futureTime);
  startDateTime.setUTCHours(futureTime.getUTCHours());
  startDateTime.setUTCMinutes(futureTime.getUTCMinutes());
  startDateTime.setUTCSeconds(0); // Start at the 0th second
  startDateTime.setUTCMilliseconds(0); // Start at the 0th millisecond

  startDateTime = startDateTime.toISOString();

  // Set the end time at the 15th minute in UTC with 59 seconds and 999 milliseconds
  let endDateTime = new Date(futureTime);
  endDateTime.setUTCHours(futureTime.getUTCHours());
  endDateTime.setUTCMinutes(futureTime.getUTCMinutes());
  endDateTime.setUTCSeconds(59); // End at the 59th second
  endDateTime.setUTCMilliseconds(999); // End at the 999th millisecond
                      
  endDateTime = endDateTime.toISOString();
  
  return { startDateTime, endDateTime , currentDateTime};
};