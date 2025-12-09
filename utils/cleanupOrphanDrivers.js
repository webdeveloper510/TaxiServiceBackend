require("dotenv").config();
const mongoose = require("mongoose");
const { redis , sub }= require("./redis");
const DRIVER_MODEL = require("../models/user/driver_model");
const DRIVER_KEY_PREFIX = process.env.DRIVER_KEY_PREFIX || "driver:";

async function getAllDriverKeys(redis) {
  let cursor = "0";
  const keys = [];

  do {
    const [nextCursor, foundKeys] = await redis.scan(
      cursor,
      "MATCH",
      `${DRIVER_KEY_PREFIX}*`,
      "COUNT",
      500
    );
    cursor = nextCursor;
    keys.push(...foundKeys);
  } while (cursor !== "0");

  return keys;
}

module.exports = async function cleanupOrphanDrivers(io) {
  console.log("🔥 cleanupOrphanDrivers(): running AFTER DB connection");

  try {
    // 1) Get all driver keys
    const keys = await getAllDriverKeys(redis);
    console.log(`🔎 [cleanup] Found ${keys.length} driver keys in Redis`);

    if (!keys.length) {
      console.log("✅ [cleanup] No driver keys to process");
      
      return;
    }

    const ids = [...new Set(keys.map(key => key.split(":").pop()))];

    // 3) Filter valid ObjectIds
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const invalidIds = ids.filter((id) => !mongoose.Types.ObjectId.isValid(id));

    // 4) Query Mongo for existing drivers with those valid IDs
    const existingDrivers = await DRIVER_MODEL.find(
                                                        { _id: { $in: validIds } },
                                                        { _id: 1 , email:1 }
                                                    )
                                                    .lean();
    
    const existingSet = new Set(existingDrivers.map((d) => String(d._id)));
    
    // 5) Orphan IDs = not in Mongo OR invalid ObjectId
    const orphanIds = ids.filter(
      (id) => !existingSet.has(id) || invalidIds.includes(id)
    );
    
    
    if (!orphanIds.length) {
      console.log("✅ [cleanup] No orphan driver IDs found")
      return;
    }

    // this is slowest method so we will use pipeline when toomany data will be exist

    // let deleteKeys = [];
    // for (let driverId of orphanIds) {
    //     if (await redis.exists(`driver:${driverId}`)) deleteKeys.push(`driver:${driverId}`);
    //     if (await redis.exists(`driver:map:eligible:${driverId}`)) deleteKeys.push(`driver:map:eligible:${driverId}`);
    // }

    const pipeline = redis.pipeline();
    const keyList = [];

    for (let driverId of orphanIds) {
        keyList.push(`driver:${driverId}`);
        keyList.push(`driver:map:eligible:${driverId}`);
    }

    // Ask Redis to check all keys at once
    keyList.forEach(key => pipeline.exists(key));

    const results = await pipeline.exec();

    // Collect keys that exist
    let deleteKeys = [];
    results.forEach((res, index) => {
                                        const [err, exists] = res;
                                        if (!err && exists === 1) {
                                            deleteKeys.push(keyList[index]);
                                        }
                                    }
                    );

    if (!deleteKeys.length) {
        console.log("✅ [cleanup] No existing Redis keys to delete for orphan IDs");
        return;
    }

    
    // 7) Delete orphan keys
    const deletedCount = await redis.del(...deleteKeys);
    console.log(
      `🧹 [cleanup] Deleted ${deletedCount} orphan driver keys from Redis`
    );

  } catch (err) {
    console.log("❌ [cleanup] Error in cleanupOrphanDrivers:", err);
    try {
     
    } catch (_) {}
  }
};