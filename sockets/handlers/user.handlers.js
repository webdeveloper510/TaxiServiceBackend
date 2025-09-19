require("dotenv").config();
const jwt = require("jsonwebtoken");
const USER_MODEL = require('../../models/user/user_model.js');
const DRIVER_MODEL = require("../../models/user/driver_model");
const {isInsideBounds} = require("../bounds")
const { redis , sub }= require("../../utils/redis");

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
    socket.on("addUser", async ({ token, socketId }) => {
        if (!token) {
            socket.emit("userConnection", { code: 200, message: "token is required" });
            return;
        }

        try {
            await USER_MODEL.updateMany(
                                            { socketId },
                                            { $set: { isSocketConnected: false, socketId: null } }
                                        );

            const tokenData = jwt.verify(token, process.env.JWTSECRET);
            const id = tokenData?.companyPartnerAccess ? tokenData?.CompanyPartnerDriverId : tokenData?.userId;

            if (tokenData?.companyPartnerAccess) {
                await DRIVER_MODEL.findByIdAndUpdate(id, { $set: { isSocketConnected: true, socketId } }, { new: true });
                socket.emit("userConnection", { code: 200, message: "connected successfully with user id: " + id });
            } else {
                const user = await USER_MODEL.findByIdAndUpdate(id, { $set: { isSocketConnected: true, socketId } }, { new: true });

                // If company also has a driver account
                await DRIVER_MODEL.findOneAndUpdate(
                                                        { email: user?.email },
                                                        { $set: { isSocketConnected: true, socketId } },
                                                        { new: true }
                                                    );

                socket.emit("userConnection", { code: 200, message: "connected successfully with user id: " + id });
            }
        } catch (err) {
        console.log("addUser err:", err);
        }
    });

    socket.on("company:app:subscribe", async ({ companyId, bounds }) => {
        

        const key = `company:app:${companyId}:bounds`;
        await redis.set(key, JSON.stringify(bounds), "EX", 300);
        socket.join(`company:app:${companyId}`);

        console.log(`🏢 Company ${companyId} subscribed`, bounds);

        // Get center of the bounding box

        const centerLat = (bounds.latMin + bounds.latMax) / 2;
        const centerLng = (bounds.lngMin + bounds.lngMax) / 2;

        // Approximate radius to cover bounding box (in km)
        const latDiff = Math.abs(bounds.latMax - bounds.latMin);
        const lngDiff = Math.abs(bounds.lngMax - bounds.lngMin);
        const radiusKm = Math.max(latDiff, lngDiff) * 111; // 1 degree ≈ 111 km

        // 1️⃣ Get driverIds in radius
        const driverIds = await redis.geosearch( "drivers:geo", "FROMLONLAT", centerLng, centerLat, "BYRADIUS", radiusKm, "km", "WITHCOORD" );
    
        
        if (driverIds.length > 0) {
            // 2️⃣ Fetch driver info in batch using pipeline
            const pipeline = redis.multi();
            driverIds.forEach((entry) => {
                
                const driverId = entry[0]
                console.log("Driver ID:", driverId);
                pipeline.hgetall(`driver:${driverId}`)
            });
            const drivers = await pipeline.exec();
            
            drivers.forEach(([err, driver]) => {

                if (err || !driver || !driver.driverId) return;
                
                const driverData = {
                                        driverId: driver.driverId,
                                        lat: parseFloat(driver.lat),
                                        lng: parseFloat(driver.lng),
                                        // info: JSON.parse(driver)
                                        details: JSON.parse(driver?.details)
                                    };

                if (isInsideBounds(driverData, bounds)) {
                    
                    socket.emit("driver::app:inBounds", driverData);
                    console.log(`📡 Sent existing driver ${driver.driverId} to company ${companyId}`);
                } else {
                    console.log(`📡 not ------------Sent existing driver ${driver.driverId} to company ${companyId}`);
                }
            });
        }

    })
}

module.exports = registerUserHandlers;