const cron = require("node-cron");
const { runCompanyTransfersBatch  , runCompanyPayoutsBatch} = require("../Service/payoutService");
exports.weeklyPayoutCron = () => {

  let isRunning = false;

  // this cron will run evry monday and starting time will be 1:00pm and each hour interval will start again like 1:00 pm , 2:00 pm and 3:00pm
  cron.schedule("0 13-23 * * 1", async () => { // every Monday after 1 pm and evry hoours
    
    if (isRunning) return;
    
    isRunning = true;
    
    try {
      await runCompanyTransfersBatch();
      await runCompanyPayoutsBatch();
    } finally {
      isRunning = false;
    }
  }, { timezone: "Europe/Amsterdam" });
}