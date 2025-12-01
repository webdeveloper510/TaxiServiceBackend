const cron = require("node-cron");
const DRIVER_MODEL = require("../models/user/driver_model");
const CONSTANT = require('../config/constant')
const { updateDriverMapCache , removeDriverForSubscribedClients} = require("../Service/location.service")

exports.driverAutoLogoutCron = (io) =>  {
  cron.schedule("* * * * *", async () => { // every minute

   try {
      await autoLogoutdriverUsers(io);
    } catch (cronErr) {
      console.error("❌ driver auto logout Cron Crash Prevented:", cronErr);
    }
  });
}

const autoLogoutdriverUsers = async (io) => {

   
    try {
        const now = new Date();
        const threeHoursBefore = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        


        const driverList = await DRIVER_MODEL.find({
                                                        is_login: true,
                                                        lastUsedTokenMobile: { $lte: threeHoursBefore }, // for mobile user
                                                        driver_state: { $nin: [CONSTANT.DRIVER_STATE.ON_THE_WAY, CONSTANT.DRIVER_STATE.ON_TRIP] },
                                                    },
                                                    { _id: 1, email: 1 }  
                                                );
        
        console.log('find driver autoLogout users----' , driverList.length)

        if (!driverList.length) return;
       

        const driverIds = driverList.map(d => d._id);
        const updateRes = await DRIVER_MODEL.updateMany(
                                        { _id: { $in: driverIds } },
                                        { $set: { is_login: false  , jwtTokenMobile: null} }
                                    );

        console.log(`🔄 Driver Auto Logout Completed → Modified: ${updateRes.modifiedCount}`);

        for (let driverInfo of driverList) {
            console.log('logout email------------' , driverInfo.email)
            const driverId = driverInfo?._id;
            const driverDetails = await updateDriverMapCache(driverId);
            removeDriverForSubscribedClients(driverDetails , io)
        }
        
    } catch (error) {
        console.log('❌❌❌❌❌❌❌❌❌Error auto logout:', error.message);
        console.log("🚀 ~ logout driver 3 hour ~ error:", error);
    }
}