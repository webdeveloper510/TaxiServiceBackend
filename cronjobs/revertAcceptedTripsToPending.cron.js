const cron = require("node-cron");
const { revertAcceptedTripsToPending } = require("../Service/tripService");

exports.revertAcceptedTripsToPendingCron = () =>  {
  cron.schedule("* * * * *", () => { // every minute
    
    revertAcceptedTripsToPending();
  });
}