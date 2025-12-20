const cron = require("node-cron");
const DRIVER_MODEL = require("../models/user/driver_model");
const CONSTANT = require('../config/constant')
const { updateDriverMapCache , removeDriverForSubscribedClients} = require("../Service/location.service")

exports.driverAutoLogoutCron = (io) =>  {
  cron.schedule("* * * * *", async () => { // every minute

   try {
      // await autoLogoutdriverUsers(io);
      await addKycToOldDriver();
    } catch (cronErr) {
      console.error("❌ driver auto logout Cron Crash Prevented:", cronErr);
    }
  });
}

const addKycToOldDriver = async () => {
  const requiredTypes = Object.values(CONSTANT.DRIVER_DOC_TYPE);

    const makeDefaultKyc = () => ({
      documents: requiredTypes.map((t) => ({
        type: t,
        files: [],
        mimeTypes: [],
        expirationDate: null, // keep if in schema
        status: CONSTANT.DOC_STATUS.NOT_UPLOADED,
        submittedAt: null,
        reviewedAt: null,
        reviewedBy: null,
        rejectReasonKey: "",
        rejectReasonText: "",
        revision: 0,
        versions: [],
      })),
      verification: {
        status: CONSTANT.DRIVER_VERIFICATION_STATUS.NOT_SUBMITTED,
        isVerified: false,
        lastSubmittedAt: null,
        lastReviewedAt: null,
        lastReviewedBy: null,
      },
      canGoOnline: false,
    });

    const batchSize = parseInt( 500);
    let totalUpdated = 0;

    while (true) {
      // find a batch of drivers missing kyc
      const drivers = await DRIVER_MODEL.find(
        {
          is_deleted: false,
          $or: [
            { kyc: { $exists: false } },
            { "kyc.documents": { $exists: false } },
            { "kyc.documents.0": { $exists: false } },
          ],
        },
        { _id: 1 }
      )
        .limit(batchSize)
        .lean();

      if (!drivers.length) break;

      const ids = drivers.map((d) => d._id);

      const result = await DRIVER_MODEL.updateMany(
        { _id: { $in: ids } },
        { $set: { kyc: makeDefaultKyc() } }
      );

      totalUpdated += result.modifiedCount || 0;

      // safety: prevent infinite loops in case of weird writes
      if ((result.modifiedCount || 0) === 0) break;
    }

    console.log("add kyc done-------------", {
      code: CONSTANT.success_code,
      updatedDrivers: totalUpdated,
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