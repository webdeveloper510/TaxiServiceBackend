require("dotenv").config();
const USER_MODEL = require('../../models/user/user_model.js');
const DRIVER_MODEL = require("../../models/user/driver_model");
const CONSTANT = require('../../config/constant');
const LOGS = require("../../models/user/logs_model");
const { driverDetailsByToken  , activeDriverInfo} = require("../../Service/helperFuntion");
const { redis , sub }= require("../../utils/redis");
const { OfflineDriver } = require("../utils");
const {isInsideBounds} = require("../../utils/bounds.js")
const { updateDriverLocationInRedis ,
        getDriversInBounds , 
        removeDriverForSubscribedClients , 
        updateDriverMapCache , 
        getDriverMapCache ,
        haversineDistanceMeters , 
        thresholdBySpeedKmh,
        broadcastForTripDriverLocation
    }  = require("../../Service/location.service.js");
const { lastEmitByDriver, lastDbUpdate } = require('./../../utils/driverCache.js');
const i18n = require("i18n");

// ---- Tunables ----
const MIN_TIME_MS = CONSTANT.MIN_TIME_MS;         // ✅ minimum time between broadcasts
const DB_SAVE_MS  = CONSTANT.DB_SAVE_MS;         // ✅ minimum time between DB saves
const JITTER_METERS = CONSTANT.JITTER_METERS;            // ignore tiny GPS jitte

// per-driver memory (in-process)
const MIN_EMIT_INTERVAL_MS = CONSTANT.MIN_EMIT_INTERVAL_MS;  // ✅ minimum time between frontend emits


function registerDriverHandlers(io, socket) {

     // Web (dashboard) driver connection
    socket.on("addWebNewDriver", async ({ token }) => {
        try {
            await DRIVER_MODEL.updateMany(
                                                { webSocketId: socket.id },
                                                { $set: { isWebSocketConnected: false, webSocketId: null } }
                                            );

            const driverByToken = await driverDetailsByToken(token);

            if (driverByToken) {

                const updatedDriver =   await DRIVER_MODEL.findByIdAndUpdate(
                                                                                driverByToken._id, // pass the driver's _id here
                                                                                {
                                                                                    $set: {
                                                                                    locationUpdatedAt: new Date(),
                                                                                    isWebSocketConnected: true,
                                                                                    webSocketId: socket.id,
                                                                                    },
                                                                                },
                                                                                { new: true } // return the updated document
                                                                            );

                socket.emit("userConnection", {
                                                code: 200,
                                                message: `connected successfully with addWebNewDriver from website user id: ${driverByToken._id}`,
                                                socket_id: socket.id,
                                                }
                            );
            }
        } catch (err) {
            console.log("addWebNewDriver err:", err);
        }
    });

    // Mobile driver connection
    socket.on("addNewDriver", async ({ token, longitude, latitude, socketId }) => {
        try {

            
            await DRIVER_MODEL.updateMany(
                                                { socketId: socket.id },
                                                { $set: { isSocketConnected: false, socketId: null } }
                                            );

            const driverByToken = await driverDetailsByToken(token);
            if (driverByToken) {

                await DRIVER_MODEL.updateOne(
                                                { _id: driverByToken._id}, // use the id from the fetched driver
                                                {
                                                    $set: {
                                                        location: { type: "Point", coordinates: [longitude, latitude] },
                                                        locationUpdatedAt: new Date(),
                                                        lastUsedTokenMobile: new Date(),
                                                        isSocketConnected: true,
                                                        socketId: socketId,
                                                    },
                                                }
                                            );

                // Sync into company-user if same email
                await USER_MODEL.updateOne(
                                            { email: driverByToken.email },
                                            { $set: { isSocketConnected: true, socketId  , lastUsedTokenMobile: new Date()} }
                                        );

                // update driver cahce data
                const getDriverDetails = await updateDriverMapCache(driverByToken._id)
               
                console.log('add driver hitting--------🥹')
                                       
                const driverId = String(driverByToken._id);
                const now = Date.now();
                const prevEmit = lastEmitByDriver.get(driverId);
                const elapsed = prevEmit ? now - prevEmit.ts : Infinity;

                if (elapsed >= MIN_EMIT_INTERVAL_MS) {

                    // update driver location for redis update
                    updateDriverLocationInRedis(io , redis ,driverByToken._id , longitude , latitude , getDriverDetails)
                    lastEmitByDriver.set(driverId, { lat: latitude, lng: longitude, ts: now });
                } else {
                    console.log(
                        `⏳ Skipped Redis update for ${driverId} (elapsed: ${elapsed}ms < ${MIN_EMIT_INTERVAL_MS}ms)`
                    );
                }

                socket.emit("driverNotification",   {
                                                        code: 200,
                                                        message: `connected successfully with addNewDriver driver id: ${driverByToken._id}`,
                                                    }
                            );
            }
        } catch (err) {
        console.log("addNewDriver err:", err);
        }
    });

    // Driver live location update
    socket.on("updateDriverLocation", async ({ longitude, latitude , driverId }) => {

        // console.log('in--------📍📍' , driverId)
        try {
            
            if (!driverId) return console.warn("⚠️ Missing driverId in location update------❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌");

            // ✅ Validate coordinates
            if ( isNaN(latitude) || isNaN(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 ) {
                return console.warn(`⚠️ Invalid coordinates for driver ${driverId}`);
            }
            
            driverId = String(driverId);
            const now = Date.now();

            // 1) last emitted sample
            const prev = lastEmitByDriver.get(driverId); // { lat, lng, ts }
            const hasPrev = !!prev;

            let distanceMoved = Infinity;
            let elapsedSinceEmit = Infinity;
            let speedKmh = 0;

            if (hasPrev) {
                const result = await haversineDistanceMeters(prev.lat, prev.lng, latitude, longitude);

                if (!result.ok) {
                    
                    return
                }
                distanceMoved = result?.meters
                elapsedSinceEmit = now - prev.ts;

                const sec = Math.max(elapsedSinceEmit / 1000, 0.001);
                speedKmh = (distanceMoved / sec) * 3.6;
            }

            // console.log('elapsedSinceEmit-------------------' , elapsedSinceEmit , MIN_TIME_MS)
            // 2) ignore tiny jitter if under min time window
            if (hasPrev && distanceMoved < JITTER_METERS && elapsedSinceEmit < MIN_TIME_MS) {
                
                return false; // skipped
            }

            // 3) dynamic distance threshold by speed
            const distanceThreshold = await thresholdBySpeedKmh(speedKmh);

            // 4) decide whether to emit
            const shouldEmit = !hasPrev || (distanceMoved >= distanceThreshold && elapsedSinceEmit >= MIN_EMIT_INTERVAL_MS) || elapsedSinceEmit >= MIN_TIME_MS;

            if (!shouldEmit) {
                
                return false;
            }

            const getDriverDetails = await getDriverMapCache(driverId);
            
            // 5) update driver live location update
            updateDriverLocationInRedis(io , redis , driverId , longitude , latitude , getDriverDetails);

            // send location pudate to the trip viewer
            broadcastForTripDriverLocation(io , driverId , longitude , latitude , getDriverDetails)
            // 6) update in-process last emit
            lastEmitByDriver.set(driverId, { lat: latitude, lng: longitude, ts: now });

            // 7) Throttled Database Save (every 15 seconds)
            
            const lastSave = lastDbUpdate.get(driverId);

            if (!lastSave || now - lastSave > DB_SAVE_MS) { // 15 seconds gap
                
                // console.log('code updated after 15 seconds for the driver location----------------')
                // console.log(`[ThrottleCheck] ${driverId} → ${(now - lastSave) / 1000}s since last DB save-----------📍📍📍📍📍--------------------------📍📍📍📍📍📍📍📍📍📍📍📍📍📍📍📍📍📍`);
                lastDbUpdate.set(driverId, now); 
                DRIVER_MODEL.findOneAndUpdate(
                                                    { _id: driverId },
                                                    {
                                                        $set: {
                                                            location: { type: "Point", coordinates: [longitude, latitude] },
                                                            locationUpdatedAt: new Date(),
                                                            lastUsedTokenMobile: new Date(), // we will logout the user if lastUsedToken time as been exceeded 3 hours
                                                        },
                                                    },
                                                    { new: true }
                                                );
            }

            // socket.emit("UpdateLocationDriver",     {
            //                                             code: 200,
            //                                             message: "location Updated successfully",
            //                                         }
            //         );
            
        } catch (error) {
            console.log("updateDriverLocation error:", error);
        }
    });

    socket.on("driver::app:subscribe", async ({ driverId, bounds } , ack) => {

        try {

            console.log('driver app susbscribed-----------')
            const key = `bounds:app:${driverId}`;
            await redis.set(key, JSON.stringify(bounds), "EX", 300); // 60 * 5 minutes = 300 seconds
            await redis.sadd("bounds:index:app:driver", key);
            socket.join(key);

            console.log('driver::app:subscribe---key and room id ------------' , key)
            console.log(`🏢 Company ${driverId} subscribed`, bounds);

            const driverList = await getDriversInBounds(bounds , driverId , socket)

            return ack({
                        code: CONSTANT.success_code,
                        message: 'driver subscribed successfully',
                        driverList: driverList
                    })
            
        } catch (error) {
            console.error("❌ Error in driver:subscribe:", error);
        }
    })

    socket.on("driver::web:subscribe", async ({ driverId, bounds } , ack) => {

        try {

            console.log('driver web susbscribed-----------')
            const key = `bounds:web:${driverId}`;
            await redis.set(key, JSON.stringify(bounds), "EX", 300); // 60 * 5 minutes = 300 seconds
            await redis.sadd("bounds:index:web:driver", key);
            socket.join(key);

            const driverList = await getDriversInBounds(bounds , driverId , socket)

            return ack({
                        code: CONSTANT.success_code,
                        message: 'driver subscribed successfully',
                        driverList: driverList
                    })
            
        } catch (error) {
            console.error("❌ Error in driver web:subscribe:", error);
        }
        
    })

    socket.on("driver::app:heartbeat", async ({ driverId }) => {
        try {
            const key = `bounds:app:${driverId}`;
            const exists = await redis.exists(key);

            if (exists) {
            // Refresh TTL to 5 minutes again
            await redis.expire(key, 300);
            console.log(`💓 Heartbeat received for driver, TTL refreshed for ${key}`);
            } else {
            console.log(`⚠️ Heartbeat received for driver but no active subscription for ${key}`);
            }
        } catch (error) {
            console.error("❌ Error in company:heartbeat:", error);
        }
    });

    socket.on("driver::web:heartbeat", async ({ driverId }) => {
        try {
            const key = `bounds:web:${driverId}`;
            const exists = await redis.exists(key);

            if (exists) {
            // Refresh TTL to 5 minutes again
            await redis.expire(key, 300);
            console.log(`💓 Heartbeat received for web driver, TTL refreshed for ${key}`);
            } else {
            console.log(`⚠️ Heartbeat received for web driver but no active subscription for ${key}`);
            }
        } catch (error) {
            console.error("❌ Error in driver web :heartbeat:", error);
        }
    });

    socket.on("driver::app:unsubscribe", async ({ driverId }) => {
        try {

            const key = `bounds:app:${driverId}`;
            await redis.del(key);
            await redis.srem("bounds:index:app:driver", key);
            socket.leave(key);

            console.log(`🏢 Driver  ${driverId} unsubscribed`);
        } catch (error) {
            console.error("❌ Error in driverId :subscribe:", error);
        }
    
    });

    socket.on("driver::web:unsubscribe", async ({ driverId }) => {
        try {
            
            const key = `bounds:web:${driverId}`;
            await redis.del(key);
            await redis.srem("bounds:index:web:driver", key);
            socket.leave(key);

            console.log(`🏢 Driver web ${driverId} unsubscribed`);
        } catch (error) {
            console.error("❌ Error in driverId web :subscribe:", error);
        }
    
    });

    socket.on("getSingleDriverInfo", async ({lang , driverId} , ack) => {
        try {
            
            let driver_info = await DRIVER_MODEL.findById(driverId);
            if (!driver_info) {
                
                return ack({
                    code: CONSTANT.success_code,
                    message: i18n.__({ phrase: "getDrivers.error.noDriverFound", locale: lang }),
                    status:driver_info?.status
                    })
            }

            return ack({
                        code: CONSTANT.success_code,
                        driver_info: driver_info
                    });

        } catch (err) {
            ack({
                code: CONSTANT.error_code,
                message: err.message,
            })
        }
    })

    socket.on("changeDriverAvailability", async ({ status  , lang , driverId ,  longitude, latitude} , ack) => {

        try {
            let driver_info = await DRIVER_MODEL.findById(driverId);
            if (!driver_info) {
                
                return ack({
                    code: CONSTANT.success_code,
                    message: i18n.__({ phrase: "getDrivers.error.noDriverFound", locale: lang }),
                    status:driver_info?.status
                    })
            }

            const activeStates = new Set([CONSTANT.DRIVER_STATE.ON_THE_WAY, CONSTANT.DRIVER_STATE.ON_TRIP]);

            if (activeStates.has(driver_info?.driver_state) && status == false) {
                return ack({
                    code: CONSTANT.error_code,
                    message: i18n.__({ phrase: "updateDriver.error.cannotGoOfflineWithActiveTrip", locale: lang }),
                    status:driver_info?.status
                });
            }

            

            await DRIVER_MODEL.updateOne( { _id: driver_info?._id }, { $set: {status : status  , lastUsedTokenMobile: new Date()} });

            if (status == false) {
                console.log('removing driver from map---------')

                // update driver cahce data
                let getDriverDetails = await updateDriverMapCache(driver_info?._id);
                removeDriverForSubscribedClients(getDriverDetails , io)
            } else {

                console.log('adding driver into map---------')
                // update driver cahce data
                let getDriverDetails = await updateDriverMapCache(driver_info?._id);
                // update driver live location update
                updateDriverLocationInRedis(io , redis , driver_info._id , longitude , latitude , getDriverDetails);
            }
            
            return ack({
                        code: CONSTANT.success_code,
                        message: i18n.__({ phrase: "updateDriver.success.driverAccountUpdated", locale: lang }),
                        status
                    });

        } catch (err) {
            

            ack({
              code: CONSTANT.error_code,
              message: err.message,
            })
        }
    })

    socket.on("changeDriverState", async ({ driver_state  , lang , driverId ,  longitude, latitude} , ack) => {

        try {
            const driver_info = await DRIVER_MODEL.findById(driverId);

            if (!driver_info){
                return ack({ code: CONSTANT.error_code, message: i18n.__({ phrase: "getDrivers.error.noDriverFound", locale: lang })})
            }

            const validStates = new Set([ CONSTANT.DRIVER_STATE.AVAILABLE, CONSTANT.DRIVER_STATE.NOT_AVAILABLE, CONSTANT.DRIVER_STATE.ON_TRIP, CONSTANT.DRIVER_STATE.ON_THE_WAY]);
            
            if (!validStates.has(driver_state)) {
                return ack({ code: CONSTANT.error_code, message: i18n.__({ phrase: 'updateDriver.error.invalidState' , locale: lang}) });
            }

            const blockedStates = new Map([
                                            [CONSTANT.DRIVER_STATE.ON_THE_WAY, 'updateDriver.error.deniedStatusChangeOnTheWay'],
                                            [CONSTANT.DRIVER_STATE.ON_TRIP, 'updateDriver.error.deniedStatusChangeOnTheTrip']
                                        ]);
                    
            if (blockedStates.has(driver_info.driver_state) && driver_state !== CONSTANT.DRIVER_STATE.AVAILABLE) {
                return  ack({
                                code: CONSTANT.error_code,
                                message: i18n.__({ phrase: blockedStates.get(driver_info.driver_state) , locale: lang })
                            });
            }

            const newState  = driver_state == CONSTANT.DRIVER_STATE.AVAILABLE ? CONSTANT.DRIVER_STATE.NOT_AVAILABLE : CONSTANT.DRIVER_STATE.AVAILABLE;
            
            console.log('sending' , driver_state ,'-----state checking-----' , { driver_state: newState })
            await DRIVER_MODEL.updateOne({ _id: driver_info._id }, { $set: { driver_state: newState  , lastUsedTokenMobile: new Date()} });
            
            // update driver cahce data
            let getDriverDetails = await updateDriverMapCache(driver_info?._id);
            
            // update driver live location update
            updateDriverLocationInRedis(io , redis , driver_info._id , longitude , latitude , getDriverDetails);
            
            return ack({
                        code: CONSTANT.success_code,
                        message: i18n.__({ phrase: "updateDriver.success.driverAccountUpdated", locale: lang }),
                        driver_state: newState
                    });

        } catch (err) {
            

            ack({
              code: CONSTANT.error_code,
              message: err.message,
            })
        }
    })

    socket.on("disconnect", async () => {
        try {
        setTimeout(async () => {
            const driverBySocketId = await DRIVER_MODEL.findOne({ socketId: socket.id });
            if (driverBySocketId) {
                
                await DRIVER_MODEL.findByIdAndUpdate(
                                                        driverBySocketId?._id , 
                                                        { 
                                                            $set:   { 
                                                                        isSocketConnected: false, 
                                                                        socketId: null 
                                                                    }
                                                        }
                                                    )
                // Mark offline after grace period
                setTimeout(() => OfflineDriver(driverBySocketId), 30 * 1000);
            }
        }, 3000);
        } catch (error) {
        console.log("socket.disconnect error:", error);
        }
    });

}

module.exports = registerDriverHandlers;