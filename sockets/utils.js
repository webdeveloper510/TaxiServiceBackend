const DRIVER_MODEL = require("../models/user/driver_model");

async function OfflineDriver(driverInfo) {
  try {
    
    const updatedDriver = await DRIVER_MODEL.findOneAndUpdate(
                                                                { _id: driverInfo._id, socketId: null }, // condition: only if socketId is null
                                                                { $set: { status: false } },             // update: set offline
                                                                { new: true }                            // return updated doc (optional)
                                                            );
    
  } catch (err) {
    console.log("OfflineDriver err:", err);
  }
}


module.exports = { OfflineDriver };