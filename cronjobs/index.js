const { weeklyPayoutCron }= require("./weeklyPayout.cron");
const { tripNotificationCron } = require("./tripNotification.cron")
const { companyInvoicecreationCron } = require("./company.invoice")
const { driverAutoLogoutCron } = require("./driverAutoLogout.cron")
function startAllCrons(io) {
  tripNotificationCron();
  weeklyPayoutCron();
  companyInvoicecreationCron();
  driverAutoLogoutCron(io);
}

module.exports = { startAllCrons };