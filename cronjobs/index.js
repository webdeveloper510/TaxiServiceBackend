const { weeklyPayoutCron }= require("./weeklyPayout.cron");
const { tripNotificationCron } = require("./tripNotification.cron")
const { companyInvoicecreationCron } = require("./company.invoice")
const { driverAutoLogoutCron } = require("./driverAutoLogout.cron")
const { companyAutoLogoutCron } = require("./companyAutoLogout.cron")
function startAllCrons(io) {
  tripNotificationCron();
  weeklyPayoutCron();
  companyInvoicecreationCron();
  driverAutoLogoutCron(io);
  companyAutoLogoutCron(io);
}

module.exports = { startAllCrons };