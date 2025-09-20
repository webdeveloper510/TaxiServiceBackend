const cron = require("node-cron");
const { sendPreTripNotifications } = require("../Service/tripService");

exports.tripNotificationCron = () =>  {
  cron.schedule("* * * * *", () => { // every minute
    
    sendPreTripNotifications();
  });
}