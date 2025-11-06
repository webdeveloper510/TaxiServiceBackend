require("dotenv").config();
const TRIP_MODEL = require('../../models/user/trip_model.js');
const DRIVER_MODEL = require("../../models/user/driver_model");
const CONSTANT = require('../../config/constant');

const { 
    emitTripCancelledByDriver,
    emitTripRetrivedByCompany,
    emitTripAcceptedByDriver 
} = require("../../Service/helperFuntion");

function registerTripHandlers(io, socket) {
    
    socket.on("companyCancelledTrip", async ({ driverId, trip }) => {
        try {
           

            const trip_details  =   await   TRIP_MODEL.findByIdAndUpdate(
                                                                            trip.result?._id,
                                                                            { $set: { driver_name: null } }
                                                                        );
           
            const driverById = await DRIVER_MODEL.findById(driverId);
            emitTripRetrivedByCompany(trip_details, driverById, socket.id, io);
        } catch (err) {
            console.log("❌❌❌❌❌❌❌❌❌Error compnay cancelled trip:",  err.message);
        
        }
    });

    socket.on("cancelDriverTrip", async ({ tripId }) => {
        
        if (!tripId) {
            return socket.emit("driverNotification", { code: 200, message: "Trip id not valid" });
        }

        setTimeout(async () => {
            try {
                const driverBySocketId = await DRIVER_MODEL.findOne({ socketId: socket.id });
                if (!driverBySocketId) return;

                const trip = await TRIP_MODEL.findById(tripId);
                
                if (!trip) {
                    return socket.emit("driverNotification", { code: 200, message: "Trip id not valid" });
                }

                if (trip.driver_name?.toString() === driverBySocketId._id.toString()) {

                    if (trip?.trip_status === CONSTANT.TRIP_STATUS.APPROVED) {
                
                        await DRIVER_MODEL.findByIdAndUpdate(driverBySocketId?._id, { $set: { is_available: true } });

                        await TRIP_MODEL.findByIdAndUpdate(tripId, { $set: { trip_status: "Pending", driver_name: null } });
                    }

                    emitTripCancelledByDriver(trip, driverBySocketId, socket.id, io);
                }

            } catch (error) {
                console.log("❌❌❌❌❌❌❌❌❌Error cancelDriverTrip:",  error.message);
                return socket.emit("driverNotification", { code: 200, message: "There is some error" });
            }
        }, 300);
    });


    socket.on("acceptDriverTrip", async ({ tripId }) => {
        if (!tripId) {
            return socket.emit("driverNotification", { code: 200, message: "Trip id not valid" });
        }

        try {
            const driverBySocketId = await DRIVER_MODEL.findOne({ socketId: socket.id });

            if (!driverBySocketId) return;

            const trip = await TRIP_MODEL.findById(tripId);

            if (!trip) {

                return socket.emit("driverNotification", { code: 200, message: "Trip id not valid" });
            }

            const update_trip = await   TRIP_MODEL.findByIdAndUpdate(
                                                                        tripId,
                                                                        { $set: { trip_status: "Booked", status: true } },
                                                                        { new: true }
                                                                    );

            socket.emit("refreshTrip",    {
                                                message: "You have accepted the trip. Please refresh the data to view the updates",
                                            }
                        );

            socket.emit("driverNotification", { code: 200, message: "Trip accepted successfully" });

            emitTripAcceptedByDriver(update_trip, driverBySocketId, socket.id, io);
        } catch (error) {
            console.log("❌❌❌❌❌❌❌❌❌Error acceptDriverTrip:",  error.message);
            return socket.emit("driverNotification", { code: 200, message: "There was an error" });
        }
    });


    socket.on("activeDriverTrip", async ({ tripId }) => {
        if (!tripId) {
            return socket.emit("driverNotification", { code: 200, message: "Trip id not valid" });
        }

        try {
            const driverBySocketId = await DRIVER_MODEL.findOne({ socketId: socket.id });
            if (!driverBySocketId) return;

            const trip = await TRIP_MODEL.findById(tripId);

            if (!trip) {

                return socket.emit("driverNotification", { code: 200, message: "Trip id not valid" });
            }

            if (trip.driver_name?.toString() === driverBySocketId._id.toString()) {

                socket.emit("driverNotification", { code: 200, message: "Trip active successfully" });
            }
        } catch (error) {
            console.log("❌❌❌❌❌❌❌❌❌Error activeDriverTrip:",  error.message);
            return socket.emit("driverNotification", { code: 200, message: "There was an error" });
        }
    });

    socket.on("getSingleTripInfo", async ({lang , tripId} , ack) => {
            try {
                
                let tripDetail = await TRIP_MODEL.findById(tripId);
                if (!tripDetail) {
                    
                    return ack({
                        code: CONSTANT.error_code,
                        message: i18n.__({ phrase: "getTrip.error.inValidTrip", locale: lang }),
                        tripId:tripId
                        })
                }
    
                return ack({
                            code: CONSTANT.success_code,
                            tripDetail: tripDetail
                        });
    
            } catch (err) {
                console.log("❌❌❌❌❌❌❌❌❌Error getSingleTripInfo:",  err.message);
                ack({
                    code: CONSTANT.error_code,
                    message: err.message,
                })
            }
        })
}

module.exports = registerTripHandlers;