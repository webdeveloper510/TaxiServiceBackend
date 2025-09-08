const { weeklyPayoutCron }= require("./weeklyPayout.cron");
const { tripNotificationCron } = require("./tripNotification.cron")
const { companyInvoicecreationCron } = require("./company.invoice")

function startAllCrons() {
  tripNotificationCron();
  weeklyPayoutCron();
  companyInvoicecreationCron();
//   driverAutoLogoutCron();
}

module.exports = { startAllCrons };