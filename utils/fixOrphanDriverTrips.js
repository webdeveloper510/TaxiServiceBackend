require("dotenv").config();
const mongoose = require("mongoose");
const { redis , sub }= require("./redis");
const DRIVER_MODEL = require("../models/user/driver_model");
const DRIVER_KEY_PREFIX = process.env.DRIVER_KEY_PREFIX || "driver:";
const { updateDriverMapCache } = require("../Service/location.service.js")
const CONSTANT = require("../config/constant.js");

// reomve current Trip id from driver account if trip not exist in the Database (When admin deleted the trip table collection manually form database)
module.exports = async function fixOrphanDriverTrips(io) {
   
    // Drivers where currentTripId is set BUT that trip does not exist
    const driversWithInvalidCurrentTrip = await DRIVER_MODEL.aggregate([
                                                                            // Only drivers that "claim" they have a current trip
                                                                            {
                                                                                $match: {
                                                                                currentTripId: { $ne: null },
                                                                                },
                                                                            },
                                                                            // Join with trips collection
                                                                            {
                                                                                $lookup: {
                                                                                from: "trips",            // collection name (model 'trip' -> 'trips')
                                                                                localField: "currentTripId",
                                                                                foreignField: "_id",
                                                                                as: "tripDoc",
                                                                                },
                                                                            },
                                                                            // If lookup found nothing, tripDoc will be []
                                                                            {
                                                                                $unwind: {
                                                                                path: "$tripDoc",
                                                                                preserveNullAndEmptyArrays: true,
                                                                                },
                                                                            },
                                                                            // Keep only those where lookup failed (no trip found)
                                                                            {
                                                                                $match: {
                                                                                tripDoc: null,            // means: no matching trip
                                                                                },
                                                                            },
                                                                            {
                                                                                $project: {
                                                                                    _id: 1,
                                                                                    first_name: 1,
                                                                                    last_name: 1,
                                                                                    phone: 1,
                                                                                    currentTripId: 1,
                                                                                    driver_state: 1,
                                                                                    is_in_ride: 1,
                                                                                    // tripDoc: 0  // if you want to hide it completely
                                                                                },
                                                                            }
                                                                        ]);

    // {is_available: isAvailable , is_in_ride: false , driver_state: driverState , currentTripId: activeOrReachedTrip?._id ? activeOrReachedTrip?._id : null}


    if (!driversWithInvalidCurrentTrip.length) {
        console.log("✅✅✅no driver found with invalid currentTripId");
        return;
    }

    console.log(`⚠️ [fixOrphanDriverTrips] Found ${driversWithInvalidCurrentTrip.length} drivers with invalid currentTripId.`);

    const driverIds = driversWithInvalidCurrentTrip.map((d) => d._id);

    // 2) Bulk update drivers in MongoDB
    const bulkOps = driverIds.map((driverId) => ({
      updateOne: {
        filter: { _id: driverId },
        update: {
          $set: {
            currentTripId: null,
            currentTrip: null, // if you also use this field
            is_in_ride: false,
            driver_state: CONSTANT.DRIVER_STATE.AVAILABLE,
            // optionally, do NOT touch is_available (that’s manual toggle)
          },
        },
      },
    }));

    const bulkResult = await DRIVER_MODEL.bulkWrite(bulkOps);

    console.log( `✅ [fixOrphanDriverTrips] Updated ${bulkResult.modifiedCount} drivers in DB.` );


    // 3) Update driver map cache / Redis in parallel (but still awaited)
    await Promise.all(
      driverIds.map(async (driverId) => {
        try {
          await updateDriverMapCache(driverId);
        } catch (err) {
          console.error(
            `[fixOrphanDriverTrips] Failed to update map cache for driver ${driverId}:`,
            err.message
          );
        }
      })
    );

    console.log( "🎉 [fixOrphanDriverTrips] Cleanup completed for all orphan driver trips.");
   
}