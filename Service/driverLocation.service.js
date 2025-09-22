// services/driverLocation.service.js
const { isInsideBounds } = require("../utils/bounds");

/** returns boolean: whether this driver should be visible on map */
async function canShowOnMap(details) {
  return !!(
    details?.status &&
    details?.is_login &&
    details?.isVerified &&
    details?.isDocUploaded &&
    !details?.is_deleted &&
    details?.defaultVehicle !== null &&
    (details?.is_special_plan_active || (details?.subscriptionData?.length ?? 0) > 0)
  );
}

/** notifies all subscribed rooms whose saved bounds include this lat/lng */
async function broadcastDriverLocation(io, redis, driverId, lng, lat, details) {
    try {

        // NOTE: KEYS is O(N). For production, prefer SCAN (see tip below).
        const keys = await redis.keys("bounds:*:*");

        for (const key of keys) {
            const [, clientType, companyId] = key.split(":"); // bounds:app:123 or bounds:web:123
            const boundsStr = await redis.get(key);
            if (!boundsStr) continue;

            const bounds = JSON.parse(boundsStr);
            const point = { lat: parseFloat(lat), lng: parseFloat(lng) };

            if (isInsideBounds(point, bounds)) {
                io.to(`bounds:${clientType}:${companyId}`).emit("driver::app:inBounds", {
                                                                                            driverId: String(driverId),
                                                                                            lat,
                                                                                            lng,
                                                                                            details,
                                                                                            lastUpdate: Date.now(),
                                                                                        }
                                                                );
                console.log('sent single driver--------')
            }
        }
    } catch (err) {
        console.error("❌ Error in broadcastDriverLocation:", err);
    }
  
}

/** stores driver position in Redis (GEO + HASH) and broadcasts */
async function updateDriverLocationInRedis(io, redis, driverId, lng, lat, details) {
    
    if (!(await canShowOnMap(details))) return true;

    const id = String(driverId);

    // Geo index
    await redis.geoadd("drivers:geo", lng, lat, id);

    // Metadata
    await redis.hset(`driver:${id}`, {
        driverId: id,
        lat,
        lng,
        lastUpdate: Date.now(),
        details: JSON.stringify(details),
    });

    // Broadcast to listeners
    await broadcastDriverLocation(io, redis, id, lng, lat, details);

    // TTL (3h)
    await redis.expire(`driver:${id}`, 10800);
}

module.exports = {
  canShowOnMap,
  broadcastDriverLocation,
  updateDriverLocationInRedis,
};