const cron = require("node-cron");
const USER_MODEL = require("../models/user/user_model");
const CONSTANT = require('../config/constant')
const { updateDriverMapCache , removeDriverForSubscribedClients} = require("../Service/location.service")

exports.companyAutoLogoutCron = (io) =>  {
  cron.schedule("* * * * *", async () => { // every minute
   try {
      await autoLogoutCompanyUsers(io);
    } catch (cronErr) {
      console.error("❌ company auto ogout Cron Crash Prevented:", cronErr);
    }
  });
}

const autoLogoutCompanyUsers = async (io) => {

   
    try {
        const now = new Date();
        const threeHoursBefore = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        
        const companyList = await USER_MODEL.find({
                                                    role: CONSTANT.ROLES.COMPANY,
                                                    lastUsedToken: { $lte: threeHoursBefore }, // for web user
                                                    webDeviceToken: { $ne: null }
                                                } , 
                                                { _id: 1 }
                                            );
        
        // console.log('find companyautoLogout users----' , companyList.length)

        if (!companyList.length) return;
        
        const ids = companyList.map(u => u._id);
        const updateRes = await USER_MODEL.updateMany(
                                                        { _id: { $in: ids } },
                                                        { $set: { webDeviceToken: null } }
                                                    );
        
        
        console.log( `🔄 company Auto Logout Completed → Modified: ${updateRes.modifiedCount}` );
        

    } catch (error) {
        console.log('❌❌❌❌❌❌❌❌❌Error company auto logout:', error.message);
        console.log("🚀 ~ logout company 3 hour ~ error:", error);
    }
}