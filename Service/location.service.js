// services/driverLocation.service.js
const { isInsideBounds } = require("../utils/bounds");
const { redis , sub }= require("../utils/redis");
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
        console.log('bounds keys---------------')
        for (const key of keys) {
            const [, clientType, id] = key.split(":"); // bounds:app:123 or bounds:web:123
            const boundsStr = await redis.get(key);
            if (!boundsStr) continue;

            const bounds = JSON.parse(boundsStr);
            const point = { lat: parseFloat(lat), lng: parseFloat(lng) };

            if (isInsideBounds(point, bounds)) {
                io.to(`bounds:${clientType}:${id}`).emit("driver::app:inBounds",    {
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
    const key = `driver:${id}`;
    // Geo index
    await redis.geoadd("drivers:geo", lng, lat, id);

    
    // Metadata
    await redis.hset(key, {
        driverId: id,
        lat,
        lng,
        lastUpdate: Date.now(),
        details: JSON.stringify(details),
    });

    await redis.expire(key, 30);

    

    if (!(await canShowOnMap(details))) return true;
    // Broadcast to listeners
    await broadcastDriverLocation(io, redis, id, lng, lat, details);

    // TTL (3h)
    await redis.expire(`driver:${id}`, 10800);
}

// get all matched driver and send to single user initiated the map susbcription
async function getDriversInBounds(bounds, id, socket) {
    try {
        
        // Get center of the bounding box

        const centerLat = (bounds.latMin + bounds.latMax) / 2;
        const centerLng = (bounds.lngMin + bounds.lngMax) / 2;

        // Approximate radius to cover bounding box (in km)
        const latDiff = Math.abs(bounds.latMax - bounds.latMin);
        const lngDiff = Math.abs(bounds.lngMax - bounds.lngMin);
        const radiusKm = Math.max(latDiff, lngDiff) * 111; // 1 degree ≈ 111 km

        // 1️⃣ Get driverIds in radius
        const geoResults = await redis.geosearch( "drivers:geo", "FROMLONLAT", centerLng, centerLat, "BYRADIUS", radiusKm, "km", "WITHCOORD" );
        
            
        if (geoResults.length > 0) {
            
            // 2️⃣ Fetch driver info in batch using pipeline
            const pipeline = redis.multi();
            geoResults.forEach((entry) => {
                
                const driverId = entry[0];
                pipeline.hgetall(`driver:${driverId}`)
            });
            const drivers = await pipeline.exec();
            
            const driversToSend = [];
            
            drivers.forEach(([err, driver]) => {

                if (err || !driver || !driver.driverId) return;
                
                const driverData = {
                                        driverId: driver.driverId,
                                        lat: parseFloat(driver.lat),
                                        lng: parseFloat(driver.lng),
                                        // info: JSON.parse(driver)
                                        details: driver?.details ? JSON.parse(driver.details) : {}
                                    };

                if (isInsideBounds(driverData, bounds)) {
                    
                    driversToSend.push(driverData);
                    // socket.emit("driver::app:inBounds", driverData);
                    // console.log(`📡 Sent existing driver ${driver.driverId} to company ${companyId}`);
                }
            });

            if (driversToSend.length > 0) {

                socket.emit("driver::app:inBounds", driversToSend); // only initiated user will get all the drivers on his side
                console.log(`📡 Sent ${driversToSend.length} drivers to company ${id}`);
            }
        }
    } catch (error) {
        console.error("❌ Error in getDriversInBounds:", error);
    }
}

/** Remove a single driver for clients whose bounds include them */
async function removeDriverForSubscribedClients(driverInfo, io) {
  try {
    const driverId = String(driverInfo?._id);
    const driverData = await redis.hgetall(`driver:${driverId}`);
    const lat = driverData?.lat ? parseFloat(driverData.lat) : null;
    const lng = driverData?.lng ? parseFloat(driverData.lng) : null;

    if (lat && lng) {
      const keys = await redis.keys("bounds:*:*");
        console.log('driver found in redis-----------------')
      const removals = [];

      for (const key of keys) {
        const [, clientType, id] = key.split(":");
        const boundsStr = await redis.get(key);
        if (!boundsStr) continue;

        const bounds = JSON.parse(boundsStr);
        if (isInsideBounds({ lat, lng }, bounds)) {
            removals.push({ room: `bounds:${clientType}:${id}`, driverInfo: driverInfo });
        //   io.to(`bounds:${clientType}:${id}`).emit("driver:removed", driverId);
        }
      }


      if (removals.length > 0) {
        // 🚀 send in parallel
        await Promise.all(
                            removals.map(({ room, driverInfo }) =>
                                            new Promise((resolve) =>    {
                                                                            io.to(room).emit("driver:removed", driverInfo);
                                                                            console.log(`📡 Notified ${room} that driver ${driverInfo?._id} was removed`);
                                                                            resolve();
                                                                        }
                                                        )
                                        )
        );
      }
    }

    // Remove from Redis
    await redis.del(`driver:${driverId}`);
    await redis.zrem("drivers:geo", driverId);

    
  } catch (err) {
    console.error(`❌ Error removing driver ${driverInfo?._id}:`, err);
  }
}

module.exports = {
  canShowOnMap,
  broadcastDriverLocation,
  updateDriverLocationInRedis,
  getDriversInBounds,
  removeDriverForSubscribedClients
};