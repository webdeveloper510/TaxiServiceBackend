const mongoose = require("mongoose");
const DRIVER_MODEL = require("../models/user/driver_model");
const { updateDriverMapCache , removeDriverForSubscribedClients} = require("../Service/location.service")

// driver will be offline and removed from the map 
async function OfflineDriver(driverInfo , io) {

  console.log('⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️⚠️functon called----------------------------- , new Date()')
  if (!driverInfo?._id) {
    console.warn("⚠️ OfflineDriver: Missing driver _id, skipping update.");
    return;
  }

  try {
    const driverId = new mongoose.Types.ObjectId(driverInfo?._id);

    const updatedDriver = await DRIVER_MODEL.findOneAndUpdate(
                                                                { _id: driverId, socketId: null }, // condition: only if socketId is null
                                                                { $set: { status: false } },             // update: set offline
                                                                { new: true }                            // return updated doc (optional)
                                                            );
    
    
    if (!updatedDriver) {
      console.debug(`❌ ℹ️ Driver ${driverInfo._id} already offline or still connected.`);
      return;
    }

    const driverDetails = await updateDriverMapCache(driverId);

    if (io) {
      removeDriverForSubscribedClients(driverDetails , io);
    } else {
      console.warn("❌ ----⚠️ OfflineDriver: 'io' instance not provided, skipping socket emission.");
    }

    console.info(`✅ Driver ${updatedDriver._id} marked offline at ${new Date().toISOString()}`);
    
  } catch (err) {
    console.error("❌ OfflineDriver error:", err.message, {
                                                            driverId: driverInfo._id,
                                                            stack: err.stack,
                                                          }
                  );
  }
}


module.exports = { OfflineDriver };