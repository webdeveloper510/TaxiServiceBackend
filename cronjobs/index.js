const { weeklyPayoutCron }= require("./weeklyPayout.cron");
const { tripNotificationCron } = require("./tripNotification.cron")

function startAllCrons() {
  tripNotificationCron();
  weeklyPayoutCron();
//   driverAutoLogoutCron();
}

module.exports = { startAllCrons };