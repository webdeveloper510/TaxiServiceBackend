const cron = require("node-cron");
const { runPayoutsBatch } = require("../Service/payoutService");
exports.weeklyPayoutCron = () => {
  cron.schedule("* * * * *", () => { // every Monday midnight
    console.log("Running weeklyPayoutCron -------");
    // runPayoutsBatch();
  });
}