require("dotenv").config();
const USER_MODEL = require('../../models/user/user_model.js');
const DRIVER_MODEL = require("../../models/user/driver_model");
const CONSTANT = require('../../config/constant');
const LOGS = require("../../models/user/logs_model");
const { driverDetailsByToken  , activeDriverInfo} = require("../../Service/helperFuntion");
const { redis , sub }= require("../../utils/redis");
const { OfflineDriver } = require("../utils");
const {isInsideBounds} = require("../../utils/bounds.js")
const { updateDriverLocationInRedis , getDriversInBounds , removeDriverForSubscribedClients , updateDriverMapCache , getDriverMapCache}  = require("../../Service/location.service.js");
const i18n = require("i18n");

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

                // update driver cahce data
                const getDriverDetails = await updateDriverMapCache(driverByToken._id)
               
                // update driver location for redis update
                updateDriverLocationInRedis(io , redis ,driverByToken._id , longitude , latitude , getDriverDetails)
            
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
                                            { $set: { isSocketConnected: true, socketId } }
                                        );

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

    // Driver live location
    socket.on("updateDriverLocation", async ({ longitude, latitude }) => {

        try {
            const driverBySocketId = await DRIVER_MODEL.findOne({ socketId: socket.id });
            
            if (driverBySocketId) {
                
                const getDriverDetails = await getDriverMapCache(driverBySocketId._id)
                
                // update driver live location update
                updateDriverLocationInRedis(io , redis , driverBySocketId._id , longitude , latitude , getDriverDetails);
                
                await DRIVER_MODEL.findOneAndUpdate(
                                                        { socketId: socket.id },
                                                        {
                                                            $set: {
                                                                location: { type: "Point", coordinates: [longitude, latitude] },
                                                                locationUpdatedAt: new Date(),
                                                                lastUsedTokenMobile: new Date(), // we will logout the user if lastUsedToken time as been exceeded 3 hours
                                                            },
                                                        },
                                                        { new: true }
                                                    );

                socket.emit("UpdateLocationDriver",     {
                                                            code: 200,
                                                            message: "location Updated successfully",
                                                        }
                        );
            }
        } catch (error) {
            console.log("updateDriverLocation error:", error);
        }
    });

    socket.on("driver::app:subscribe", async ({ driverId, bounds } , ack) => {

        try {

            console.log('driver susbscribed-----------')
            const key = `bounds:app:${driverId}`;
            await redis.set(key, JSON.stringify(bounds), "EX", 300); // 60 * 5 minutes = 300 seconds
            socket.join(key);

            console.log('key and room id ------------' , key)
            console.log(`🏢 Company ${driverId} subscribed`, bounds);

            getDriversInBounds(bounds , driverId , socket)

            return ack({
                            code: CONSTANT.success_code,
                            message: 'driver subscribed successfully'
                        })
        } catch (error) {
            console.error("❌ Error in company:subscribe:", error);
        }
        
    })

    socket.on("driver::app:heartbeat", async ({ driverId }) => {
            try {
                const key = `bounds:app:${driverId}`;
                const exists = await redis.exists(key);
    
                if (exists) {
                // Refresh TTL to 5 minutes again
                await redis.expire(key, 300);
                console.log(`💓 Heartbeat received, TTL refreshed for ${key}`);
                } else {
                console.log(`⚠️ Heartbeat received but no active subscription for ${key}`);
                }
            } catch (error) {
                console.error("❌ Error in company:heartbeat:", error);
            }
        });

    socket.on("driver::app:unsubscribe", async ({ driverId }) => {
            try {
                const key = `bounds:app:${driverId}`;
                await redis.del(key);
                socket.leave(driverId);
                console.log(`🏢 Driver  ${driverId} unsubscribed`);
            } catch (error) {
                console.error("❌ Error in driverId :subscribe:", error);
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

            

            await DRIVER_MODEL.updateOne( { _id: driver_info?._id }, { $set: {status : status} });

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

            if (!driver_info)
                return ack({ code: CONSTANT.success_code, message: i18n.__({ phrase: "getDrivers.error.noDriverFound", locale: lang })})
            
            const validStates = new Set([ CONSTANT.DRIVER_STATE.AVAILABLE, CONSTANT.DRIVER_STATE.NOT_AVAILABLE, CONSTANT.DRIVER_STATE.ON_TRIP, CONSTANT.DRIVER_STATE.ON_THE_WAY]);
            
            if (!validStates.has(driver_state)) 
                return ack({ code: CONSTANT.error_code, message: i18n.__({ phrase: 'updateDriver.error.invalidState' , locale: lang}) });

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
            
            await DRIVER_MODEL.updateOne({ _id: driver_info._id }, { $set: { driver_state: newState } });
            
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