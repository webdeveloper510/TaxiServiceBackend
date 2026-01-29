require("dotenv").config();
const TRIP_MODEL = require("../models/user/trip_model.js");
const USER_MODEL = require("../models/user/user_model");
const DRIVER_MODEL = require("../models/user/driver_model");
const AGENCY_MODEL = require("../models/user/agency_model.js");;
const CONSTANT = require("../config/constant.js");
const SETTING_MODEL = require('../models/user/setting_model')
const i18n = require('../i18n');
const {  sendNotification  , sendBookingUpdateDateTimeEmail , sendTripUpdateToCustomerViaSMS} = require("./helperFuntion");

exports.sendDriverPreTripNotifications =  async () => {

    try {
        const currentDate = new Date();
        // const fifteenMinutesBefore = new Date(currentDate.getTime() + 15 * 60000); // Add 15 minutes in milliseconds  console.log("🚀 ~ checkTripsAndSendNotifications ~ fifteenMinutesBefore:", fifteenMinutesBefore)
        // const thirteenMinutesBefore = new Date(currentDate.getTime() + 13 * 60000);

        let fifteenMinutesBefore = new Date(currentDate.getTime() + 15 * 60000); // Add 15 minutes in milliseconds  console.log("🚀 ~ checkTripsAndSendNotifications ~ fifteenMinutesBefore:", fifteenMinutesBefore)
        let thirteenMinutesBefore = new Date(currentDate.getTime() + 13 * 60000);

        const adminPrepreNotificationTime = await SETTING_MODEL.findOne({key: CONSTANT.ADMIN_SETTINGS.PRE_NOTIFICATION_TIME});

        let preNotificationTime = 15; // sensible default

        if ( adminPrepreNotificationTime && adminPrepreNotificationTime.value !== undefined ) {
            const parsed = parseInt(parseFloat(adminPrepreNotificationTime.value));
            if (!isNaN(parsed)) {
                preNotificationTime = parsed;
            }
        }

        const { startDateTime, endDateTime  , currentDateTime} = await this.computePreNotificationTimeWindow(preNotificationTime);
        // fifteenMinutesBefore = new Date(endDateTime);
        // thirteenMinutesBefore = new Date(startDateTime);

        const trips = await TRIP_MODEL.find({
                                                pickup_date_time: {$gte: (startDateTime), $lte: endDateTime },
                                                // pickup_date_time: { $gte: thirteenMinutesBefore },
                                                fifteenMinuteNotification: false,
                                                driver_name: { $ne: null },
                                                trip_status: { $nin:    [
                                                                            CONSTANT.TRIP_STATUS.COMPLETED, 
                                                                            CONSTANT.TRIP_STATUS.CANCELED,
                                                                            CONSTANT.TRIP_STATUS.PENDING,
                                                                            CONSTANT.TRIP_STATUS.NO_SHOW,
                                                                            
                                                                        ] } 
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
                let driverNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `${preNotificationTime} minutes`});
    
                let driverNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `${preNotificationTime} minutes`});
                sendNotification( trip?.driver_name?.deviceToken, driverNotificationMessage, driverNotificationTitle, trip )
            }

            // send to trip's driver web
            if (trip?.driver_name?.webDeviceToken) {
                    
                let targetLocale = trip?.driver_name?.web_locale || process.env.DEFAULT_LANGUAGE;
                let driverNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `${preNotificationTime} minutes`});
        
                let driverNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `${preNotificationTime} minutes`});
                sendNotification( trip?.driver_name?.webDeviceToken, driverNotificationMessage, driverNotificationTitle, trip )
            }
            
            // send to trip's company app
            if (trip.created_by_company_id?.deviceToken) {
                
                let targetLocale = trip?.created_by_company_id?.app_locale || process.env.DEFAULT_LANGUAGE;
                let companyNotificationMessage = i18n.__({ phrase: "editTrip.notification.companyPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `${preNotificationTime} minutes`});
        
                let companyNotificationTitle = i18n.__({ phrase: "editTrip.notification.companyPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `${preNotificationTime} minutes`});
        
                sendNotification( trip.created_by_company_id?.deviceToken, companyNotificationMessage, companyNotificationTitle, trip )
            }

            // send to trip's company web
            if (trip.created_by_company_id?.webDeviceToken) {
                
                let targetLocale = trip?.created_by_company_id?.web_locale || process.env.DEFAULT_LANGUAGE;
                let companyNotificationMessage = i18n.__({ phrase: "editTrip.notification.companyPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `${preNotificationTime} minutes`});
        
                let companyNotificationTitle = i18n.__({ phrase: "editTrip.notification.companyPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `${preNotificationTime} minutes`});
        
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
    
        console.log("❌❌❌❌❌❌❌❌❌Error sendDriverPreTripNotifications:",  error.message);
    
    // throw error;
  }
}


exports.sendCustomerPreTripNotifications =  async () => {

    try {

        
        const preNotificationTime = CONSTANT.CUSTOMER_PRE_TRIP_NOTIFICATION_TIME; // fixed 10 minutes for customer
        const { startDateTime, endDateTime } = await exports.computePreNotificationTimeWindow(preNotificationTime);
    
        // console.log("🚀 ~ sendCustomerPreTripNotifications ~ Running customer pre trip notification cron job" , new Date() , { startDateTime, endDateTime });
        // Fetch trips: in window, valid email, not already notified
        const trips = await TRIP_MODEL.find({
                                                pickup_date_time: { $gte: startDateTime, $lte: endDateTime },
                                                trip_status: {
                                                    $nin: [
                                                    CONSTANT.TRIP_STATUS.COMPLETED,
                                                    CONSTANT.TRIP_STATUS.CANCELED,
                                                    CONSTANT.TRIP_STATUS.NO_SHOW,
                                                    ],
                                                },
                                                "customerDetails.email": { $nin: [null, ""] },
                                                customerPreNotificationSent: { $ne: true },
                                            });

        const ids = [];

        for (let trip of trips) {

            const customer = trip.customerDetails || {};
            const customerEmail = customer.email;
            
            if (!customerEmail) continue;
            
            const targetLocale = process.env.DEFAULT_LANGUAGE || "en";
            const createdByCompany = await USER_MODEL.findById(trip.created_by_company_id)
            sendBookingUpdateDateTimeEmail(trip);

            if (createdByCompany?.settings?.sms_options?.driver_on_the_way_request?.enabled) { // check if company turned on sms feature for driver on the route
                sendTripUpdateToCustomerViaSMS(trip , CONSTANT.SMS_EVENTS.DRIVER_ON_THE_WAY);
            }
            ids.push(trip._id);
        }

        if (ids.length) {
            await TRIP_MODEL.updateMany(
                                            { _id: { $in: ids } },
                                            {
                                            $set: {
                                                customerPreNotificationSent: true,
                                            },
                                            }
                                        );
        }
    } catch (error) {
    
        console.log("❌❌❌❌❌❌❌❌❌Error sendCustomerPreTripNotifications:",  error.message);
    
        // throw error;
    }
}

exports.computePreNotificationTimeWindow = async (preNotificationTime = 20) => {

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
  
  return { startDateTime, endDateTime , currentDateTime , preNotificationTime};
};

exports.revertAcceptedTripsToPending = async () => {
    try{

        const EXPIRY_SECONDS = Number(process.env.TRIP_POP_UP_SHOW_TIME || 20);
        const expiredBefore = new Date(Date.now() - EXPIRY_SECONDS * 1000);

        console.log("revertAcceptedTripsToPending------" , new Date().toLocaleString());

        const acceptedTrips = await TRIP_MODEL.find({
                                                        trip_status: CONSTANT.TRIP_STATUS.APPROVED,
                                                        driver_name: { $exists: true, $ne: null },
                                                        vehicle: { $exists: true, $ne: null },
                                                        is_deleted: false,
                                                        send_request_date_time: { $ne: null, $lte: expiredBefore },
                                                    })
                                                    .select({ _id: 1, driver_name: 1 , trip_id:1 , send_request_date_time: 1})
                                                    .limit(500)
                                                    .lean();

        console.log("revert accepted trips found ✅ : ", acceptedTrips.length , acceptedTrips);

        if (!acceptedTrips.length) return 

        const tripIds = acceptedTrips.map(t => t._id);

        // revert trips (race-safe)
        await TRIP_MODEL.updateMany(
                                        {
                                            _id: { $in: tripIds },
                                            trip_status: CONSTANT.TRIP_STATUS.APPROVED,
                                            send_request_date_time: { $ne: null, $lte: expiredBefore },
                                        },
                                        {
                                            $set:   {
                                                        trip_status: CONSTANT.TRIP_STATUS.PENDING,
                                                        driver_name: null,
                                                        vehicle: null,
                                                    },
                                            $unset: { send_request_date_time: "" },
                                        }
                                    );

        console.log("revert accepted trip updated----✅ ")
    } catch (error) {
    
        console.log("❌❌❌❌❌❌❌❌❌Error revertAcceptedTripsToPending:",  error.message);
    
    // throw error;
  }
}