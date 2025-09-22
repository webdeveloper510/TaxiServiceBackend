require("dotenv").config();
const USER_MODEL = require('../../models/user/user_model.js');
const DRIVER_MODEL = require("../../models/user/driver_model");
const CONSTANT = require('../../config/constant');
const LOGS = require("../../models/user/logs_model");
const { driverDetailsByToken  , activeDriverInfo} = require("../../Service/helperFuntion");
const { redis , sub }= require("../../utils/redis");
const { OfflineDriver } = require("../utils");
const {isInsideBounds} = require("../../utils/bounds.js")
const {updateDriverLocationInRedis}  = require("../../Service/driverLocation.service.js");

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

                const getDriverDetails = await activeDriverInfo(driverByToken._id)
               
                updateDriverLocationInRedis(io , redis ,driverByToken._id , longitude , latitude , getDriverDetails)
            
                const updatedDriver =   await DRIVER_MODEL.findByIdAndUpdate(
                                                                                driverByToken._id, // use the id from the fetched driver
                                                                                {
                                                                                $set: {
                                                                                    location: { type: "Point", coordinates: [longitude, latitude] },
                                                                                    locationUpdatedAt: new Date(),
                                                                                    isSocketConnected: true,
                                                                                    socketId: socketId,
                                                                                },
                                                                                },
                                                                                { new: true } // return the updated document
                                                                            );

                // Sync into company-user if same email
                await USER_MODEL.findOneAndUpdate(
                                                    { email: driverByToken.email },
                                                    { $set: { isSocketConnected: true, socketId } },
                                                    { new: true }
                                                );

                socket.emit("driverNotification", {
                code: 200,
                message: `connected successfully with addNewDriver driver id: ${driverByToken._id}`,
                });
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
                console.log('inside-------------------------------------------------------------------------')
                const getDriverDetails = await activeDriverInfo(driverBySocketId._id)
                console.log('getDriverDetails---------' , getDriverDetails)
                updateDriverLocationInRedis(io , redis , driverBySocketId._id , longitude , latitude , getDriverDetails);
                
                await DRIVER_MODEL.findOneAndUpdate(
                                                        { socketId: socket.id },
                                                        {
                                                            $set: {
                                                            location: { type: "Point", coordinates: [longitude, latitude] },
                                                            locationUpdatedAt: new Date(),
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