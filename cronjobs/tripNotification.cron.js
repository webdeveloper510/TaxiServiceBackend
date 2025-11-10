const cron = require("node-cron");
const { sendDriverPreTripNotifications  , sendCustomerPreTripNotifications} = require("../Service/tripService");

exports.tripNotificationCron = () =>  {
  cron.schedule("* * * * *", () => { // every minute
    
    sendDriverPreTripNotifications();
    sendCustomerPreTripNotifications();
  });
}