const cron = require("node-cron");
const { sendPreTripNotifications } = require("../Service/tripService");

exports.tripNotificationCron = () =>  {
  cron.schedule("* * * * *", () => { // every minute
    console.log("Running tripNotificationCron -------");
    sendPreTripNotifications();
  });
}