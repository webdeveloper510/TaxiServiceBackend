// services/driverLocation.service.js
const { isInsideBounds } = require("../utils/bounds");
const { redis , sub }= require("../utils/redis");
const { activeDriverInfo } = require("../Service/helperFuntion");
const CONSTANT = require('../config/constant');

/** returns boolean: whether this driver should be visible on map */
async function canShowOnMap(details) {
  // console.log({
  //   email: details?.email,
  //   status: details?.status , 
  //   is_login: details?.is_login , 
  //   isVerified: details?.isVerified , 
  //   isDocUploaded: details?.isDocUploaded , 
  //   is_deleted: details?.is_deleted ,
  //   is_blocked :details?.is_blocked ,
  //   defaultVehicle: details?.defaultVehicle ? true : false ,
  //   last: (details?.is_special_plan_active || (details?.subscriptionData?.length ?? 0) > 0) , 
  // })
  return !!(
    details?.status &&
    details?.is_login &&
    details?.isVerified &&
    details?.isDocUploaded &&
    !details?.is_deleted &&
    !details?.is_blocked &&
    details?.defaultVehicle !== null &&
    (details?.is_special_plan_active || (details?.subscriptionData?.length ?? 0) > 0)
  );
}

/** notifies all subscribed rooms whose saved bounds include this driver lat/lng */
async function broadcastDriverLocation(io, driverId, details) {
    try {

        driverId = String(driverId);
        const driverKey = `driver:${driverId}`;

        if (!(await redis.exists(driverKey))) return; // exit if key doesn't exist
        const keys = await redis.keys("bounds:*:*");

        

        if (!(await canShowOnMap(details))) return true; // check if it is eligible or not to show on the map

        const [lat, lng] = await redis.hmget(driverKey, "lat", "lng");
      
       
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
              console.log('sent single driver--------' , details.email)
            }
        }
    } catch (err) {
        console.error("❌ Error in broadcastDriverLocation:", err);
    }
  
}

/** stores driver position in Redis (GEO + HASH) and broadcasts */
async function updateDriverLocationInRedis(io, redis, driverId, lng, lat, details) {
    
  try {

    // // fake lat long added for web testing only- start--------
    // let newLatlng = await randomOffsetLatLng(lat , lng , 1500);
    
    // lat = newLatlng.lat;
    // lng = newLatlng.lng;
    // // fake lat long added for web testing only- end--------

    driverId = String(driverId);

    console.log("drivers:geo", lng, lat, driverId)
    const key = `driver:${driverId}`;
    await redis.geoadd("drivers:geo", lng, lat, driverId); // Geo index

    const driverDetails = await getDriverMapCache(driverId);
    // Metadata
    await redis.hset(key, {
                              driverId: driverId,
                              lat,
                              lng,
                              lastUpdate: Date.now(),
                              details: JSON.stringify(driverDetails),
                          }
                    );
  
    // Broadcast to listeners
    // await broadcastDriverLocation(io, redis, driverId, lng, lat, driverDetails);
    await broadcastDriverLocation(io, driverId, driverDetails);

    // TTL (3h)
    // await redis.expire(key, 10800); // 3 hours expiration 10800

  } catch (err) {
        console.error("❌ Error in updateDriverLocationInRedis:", err);
    } 
}

async function randomOffsetLatLng(lat, lng, radiusMeters = 50) {
  const earthRadius = 6378137; // meters
  // Random distance in meters (0 to radiusMeters)
  const distance = Math.random() * radiusMeters;
  // Random angle in radians (0 to 2π)
  const angle = Math.random() * 2 * Math.PI;

  // Offset in meters
  const dx = distance * Math.cos(angle);
  const dy = distance * Math.sin(angle);

  // Convert meters to degrees
  const newLat = lat + (dy / earthRadius) * (180 / Math.PI);
  const newLng = lng + (dx / (earthRadius * Math.cos((Math.PI * lat) / 180))) * (180 / Math.PI);

  return {lat:newLat, lng: newLng};
}

// get all matched driver and send to single user initiated the map susbcription  (get all drivers and send it to single user)
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
           
            console.log('here-----------' , drivers.length)

            // await drivers.forEach(async ([err, driver]) => {
              for (const [err, driver] of drivers) {
                
                if (err || !driver || !driver.driverId) continue;
                
                const details = driver?.details ? JSON.parse(driver.details) : {}
                
                console.log("show on map " , await canShowOnMap(details) , 'email-------' ,details?.email)
                
                if (!(await canShowOnMap(details))) continue;

                const driverData = {
                                      driverId: driver.driverId,
                                      lat: parseFloat(driver.lat),
                                      lng: parseFloat(driver.lng),
                                      // info: JSON.parse(driver)
                                      details: details
                                    };
                
                if (await isInsideBounds(driverData, bounds)) {
                    
                    driversToSend.push(driverData);
                    // socket.emit("driver::app:inBounds", driverData);
                    // console.log(`📡 Sent existing driver ${driver.driverId} to company ${companyId}`);
                } else {
                  console.log('out of bounds----------' , details?.email)
                }
            }

            if (driversToSend.length > 0) {

                // socket.emit("driver::app:inBounds", driversToSend); // only initiated user will get all the drivers on his side
                console.log(`📡 Sent ${driversToSend.length} drivers to company ${id}`);
            } else {
              socket.emit("driver::app:inBounds", [])
            }

            return driversToSend
        }
    } catch (error) {
        console.error("❌ Error in getDriversInBounds:", error);
    }
}

/** Remove a single driver for clients whose bounds include them */
async function removeDriverForSubscribedClients(driverInfo, io) {
  try {
    
    driverInfo = await getDriverMapCache(driverInfo?._id)
    const driverId = String(driverInfo?._id);

    // const existingDriver = await redis.zscore("drivers:geo", driverId);

    // if (existingDriver === null) return false;

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
    // await redis.del(`driver:${driverId}`);  // we will not delete driver profile. we can use it anytime in the project
    await redis.zrem("drivers:geo", driverId);

    
  } catch (err) {
    console.error(`❌ Error removing driver ${driverInfo?._id}:`, err);
  }
}


async function updateDriverMapCache (driverId) {

  try {
    const key = `driver:map:eligible:${driverId}`;
    const getDriverDetails = await activeDriverInfo(driverId);

    await redis.set(key, JSON.stringify(getDriverDetails));
    console.log('Cache updated:', key);

    const driverKey = `driver:${driverId}`;

    const isDriverExistInCache = await redis.exists(driverKey);

    if (isDriverExistInCache) {
      // Update only the 'details' field
      await redis.hset(driverKey, 'details', JSON.stringify(getDriverDetails));
      console.log('cache details update for the exist driver----------')
    } else {
      console.log('no driver already found for redis --------------------')
    }

    return getDriverDetails;
  } catch (err) {
    console.error(`❌ Error updateDriverMapCache  ${driverId}:`, err);
  }
  
}

async function getDriverMapCache(driverId) {
  const key = `driver:map:eligible:${driverId}`;
  const driverCached = await redis.get(key);

  if (driverCached) {
    return JSON.parse(driverCached);
  }

  // if not found in cache → refresh
  return updateDriverMapCache(driverId);
}

// Haversine distance in meters -------- get distance in meter betwwen 2 lat long
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  // --- Validate ---
  const isNum = Number.isFinite;
  if (![lat1, lon1, lat2, lon2].every(isNum))
    return { ok: false, error: "Inputs must be finite numbers" };
  if (Math.abs(lat1) > 90 || Math.abs(lat2) > 90)
    return { ok: false, error: "Latitude must be in [-90, 90]" };
  if (Math.abs(lon1) > 180 || Math.abs(lon2) > 180)
    return { ok: false, error: "Longitude must be in [-180, 180]" };

  // --- Haversine ---
  const R = 6371e3;                 // Earth radius in meters
  const RAD = Math.PI / 180;        // degrees → radians
  const φ1 = lat1 * RAD, φ2 = lat2 * RAD;
  const dφ = (lat2 - lat1) * RAD;
  const dλ = (lon2 - lon1) * RAD;

  let a = Math.sin(dφ / 2) ** 2 +
          Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  a = Math.min(1, Math.max(0, a));  // numeric guard

  const meters = 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number.isFinite(meters)
    ? { ok: true, meters }
    : { ok: false, error: "Computation failed" };
}

/**
 * Adaptive threshold by speed (km/h):
 * < 20 → 15 m, 20–60 → 30 m, > 60 → 50 m
 */
function thresholdBySpeedKmh(speedKmh) {
  const band = CONSTANT.SPEED_BANDS.find(b => speedKmh < b.max);
  return band.value;
}

module.exports = {
  canShowOnMap,
  broadcastDriverLocation,
  updateDriverLocationInRedis,
  getDriversInBounds,
  removeDriverForSubscribedClients,
  updateDriverMapCache,
  getDriverMapCache,
  haversineDistanceMeters,
  thresholdBySpeedKmh
};