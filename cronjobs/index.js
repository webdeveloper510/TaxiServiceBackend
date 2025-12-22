const { weeklyPayoutCron }= require("./weeklyPayout.cron");
const { tripNotificationCron } = require("./tripNotification.cron")
const { companyInvoicecreationCron } = require("./company.invoice")
const { driverAutoLogoutCron } = require("./driverAutoLogout.cron")
const { companyAutoLogoutCron } = require("./companyAutoLogout.cron")
const {processDriverDocumentExpiryAlerts } = require("./processDriverDocumentExpiryAlerts.cron")
const { driverDocumentExpiry } = require("./driverDocumentExpiry.cron")
function startAllCrons(io) {
  tripNotificationCron();
  weeklyPayoutCron();
  companyInvoicecreationCron();
  driverAutoLogoutCron(io);
  companyAutoLogoutCron(io);
  processDriverDocumentExpiryAlerts(io);
  driverDocumentExpiry(io);
}

module.exports = { startAllCrons };