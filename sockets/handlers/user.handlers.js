require("dotenv").config();
const jwt = require("jsonwebtoken");
const USER_MODEL = require('../../models/user/user_model.js');
const DRIVER_MODEL = require("../../models/user/driver_model");
const {isInsideBounds} = require("../../utils/bounds.js")
const { redis , sub }= require("../../utils/redis");
const { activeDriverInfo } = require("../../Service/helperFuntion");
const CONSTANT = require('../../config/constant');
const {updateDriverLocationInRedis , getDriversInBounds , updateDriverMapCache}  = require("../../Service/location.service.js");
const i18n = require("i18n");

function registerUserHandlers(io, socket) {
    // Web user (company or driver-as-partner) connections
    socket.on("addWebUser", async ({ token }) => {

        if (!token) {
            socket.emit("userConnection", { code: 200, message: "token is required" });
            return;
        }

        try {
            await USER_MODEL.updateMany(
                                            { webSocketId: socket.id },
                                            { $set: { isWebSocketConnected: false, webSocketId: null } }
                                        );

            const tokenData = jwt.verify(token, process.env.JWTSECRET);
            const id = tokenData?.companyPartnerAccess ? tokenData?.CompanyPartnerDriverId : tokenData?.userId;
            const socketId = socket.id;

            if (tokenData?.companyPartnerAccess) {
                const driver = await DRIVER_MODEL.findByIdAndUpdate(
                                                                        id,
                                                                        { $set: { isWebSocketConnected: true, webSocketId: socketId } },
                                                                        { new: true }
                                                                    );
                if (driver) {
                    socket.emit("userConnection", {
                                                                code: 200,
                                                                message: "connected successfully with user id: " + id,
                                                                user: driver,
                                                                socketId,
                                                            }
                                        );
                }
            } else {
                const user = await USER_MODEL.findByIdAndUpdate(
                                                                    id,
                                                                    { $set: { isWebSocketConnected: true, webSocketId: socketId } },
                                                                    { new: true }
                                                                );
                if (user) {

                    socket.emit("userConnection",   {
                                                        code: 200,
                                                        message: "connected successfully with user id: " + id,
                                                        user,
                                                        socketId,
                                                    }
                                );
                }
            }
        } catch (err) {
            console.log("addWebUser err:", err);
        }
    });

    // Mobile user (company or driver-as-partner) connections
    socket.on("addUser", async ({ token, longitude, latitude, socketId }) => {
        
        // console.log('longitude, latitude, socketId--------' , longitude, latitude, socketId)
        if (!token) {
            return socket.emit("userConnection", { code: 200, message: "token is required" });
            
        }

        try {
            await USER_MODEL.updateMany( { socketId }, { $set: { isSocketConnected: false, socketId: null } } );

            const tokenData = jwt.verify(token, process.env.JWTSECRET);
            const id = tokenData?.companyPartnerAccess ? tokenData?.CompanyPartnerDriverId : tokenData?.userId;

            if (tokenData?.companyPartnerAccess) {

                await DRIVER_MODEL.findByIdAndUpdate(id, { $set: { isSocketConnected: true, socketId  , lastUsedTokenMobile: new Date()} }, { new: true });
                socket.emit("userConnection", { code: 200, message: "connected successfully with user id: " + id });

            } else {

                const user = await USER_MODEL.findByIdAndUpdate(id, { $set: { isSocketConnected: true, socketId , lastUsedTokenMobile: new Date()} }, { new: true });

                // If company also has a driver account
                const driverDetail = await DRIVER_MODEL.findOneAndUpdate(
                                                                            { email: user?.email },
                                                                            { $set: { isSocketConnected: true, socketId  ,  lastUsedTokenMobile: new Date()} },
                                                                            { new: true }
                                                                        );
                
                socket.emit("userConnection", { code: 200, message: "connected successfully with user id: " + id });

                // If company is also the driver then update his location as driver also for the map to get the trip alocation
                if (driverDetail) {
                    
                    const getDriverDetails = await updateDriverMapCache(driverDetail._id);
                    updateDriverLocationInRedis(io , redis ,driverDetail._id , longitude , latitude , getDriverDetails)
                }
                
            }
        } catch (err) {
        console.log("addUser err:", err);
        }
    });

    socket.on("getSingleCompanyInfo", async ({lang , companyId} , ack) => {
            try {
                
                let userInfo = await USER_MODEL.findById(companyId);
                if (!userInfo) {
                    
                    return ack({
                                    code: CONSTANT.success_code,
                                    message: i18n.__({ phrase: "addSubAdmin.error.noUserFound", locale: lang })
                                })
                }
    
                return ack({
                            code: CONSTANT.success_code,
                            userInfo: userInfo
                        });
    
            } catch (err) {
                ack({
                  code: CONSTANT.error_code,
                  message: err.message,
                })
            }
        })

    socket.on("company::app:subscribe", async ({ companyId, bounds } , ack) => {
        
        try {

            const key = `bounds:app:${companyId}`;
            await redis.set(key, JSON.stringify(bounds), "EX", 300); // 60 * 5 minutes = 300 seconds
            socket.join(key);

            console.log('company::app:subscribe -----------key and room id ------------' , key)
            // console.log(`🏢 Company ${companyId} subscribed`, bounds);

            const driverList = await getDriversInBounds(bounds , companyId , socket)
            return ack({
                        code: CONSTANT.success_code,
                        message: 'compnay subscribed successfully',
                        driverList: driverList ? driverList : []
                    })
           
           
        } catch (error) {
            console.error("❌ Error in company:subscribe:", error);
        }

    })

    socket.on("company::app:heartbeat", async ({ companyId }) => {
        try {
            const key = `bounds:app:${companyId}`;
            const exists = await redis.exists(key);

            if (exists) {
            // Refresh TTL to 5 minutes again
            await redis.expire(key, 300);
            console.log(`💓 Heartbeat received for compnay, TTL refreshed for ${key}`);
            } else {
            console.log(`⚠️ Heartbeat received for company but no active subscription for ${key}`);
            }
        } catch (error) {
            console.error("❌ Error in company:heartbeat:", error);
        }
    });

    socket.on("company::app:unsubscribe", async ({ companyId }) => {
        try {
            
            const key = `bounds:app:${companyId}`;
            await redis.del(key);
            socket.leave(key);
            console.log(`🏢 Company ${companyId} unsubscribed`);
        } catch (error) {
            console.error("❌ Error in company:subscribe:", error);
        }
    });
}

module.exports = registerUserHandlers;