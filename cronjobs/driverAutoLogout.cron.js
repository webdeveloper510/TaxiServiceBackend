const cron = require("node-cron");
const DRIVER_MODEL = require("../models/user/driver_model");
const CONSTANT = require('../config/constant')
const { updateDriverMapCache , removeDriverForSubscribedClients} = require("../Service/location.service")

exports.driverAutoLogoutCron = (io) =>  {
  cron.schedule("* * * * *", () => { // every minute
    
   autoLogout(io)
  });
}

const autoLogout = async (io) => {

   
    try {
        const now = new Date();
        const threeHoursBefore = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        


        const driverList = await DRIVER_MODEL.find({
                                                    is_login: true,
                                                    lastUsedTokenMobile: { $lte: threeHoursBefore },
                                                    driver_state: { $nin: [CONSTANT.DRIVER_STATE.ON_THE_WAY, CONSTANT.DRIVER_STATE.ON_TRIP] }
                                                });

        console.log('find autoLogout users----' , driverList)

        if (driverList) {

            // Step 2: Update all of them
            await DRIVER_MODEL.updateMany(
                                            { _id: { $in: driverList.map(u => u._id) } },
                                            { $set: { is_login: false } }
                                        );

            for (let driverInfo of driverList) {
                console.log('logout email------------' , driverInfo.email)
                const driverId = driverInfo?._id;
                const driverDetails = await updateDriverMapCache(driverId);
                removeDriverForSubscribedClients(driverDetails , io)
            }
        }
        

        

    } catch (error) {
        console.log("🚀 ~ logout driver 3 hour ~ error:", error);
    }
}