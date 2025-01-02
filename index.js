require("dotenv").config();
var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cron = require("node-cron");
const db = require("./config/db");
const http = require("http");
const cors = require("cors");
const agency_model = require("./models/user/agency_model.js");
var apiRouter = require("./routes/index.js");
const { Server } = require("socket.io");
const { driverDetailsByToken, userDetailsByToken, sendNotification, } = require("./Service/helperFuntion");
const driver_model = require("./models/user/driver_model");
const trip_model = require("./models/user/trip_model.js");
const user_model = require("./models/user/user_model");
const mongoose = require("mongoose");
var app = express();
app.use(cors());
const httpServer = http.createServer(app);
// view engine setup

app.use(logger("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
const io = new Server(httpServer, {
                                    cors: {
                                      origin: "*",
                                    },
                                  }
                      );
app.use((req, res, next) => {
  req.io = io; // Set the io object in the request object
  next();
});

app.use("/uploads/", express.static("./uploads"));

// app.use('/admin', adminRouter);
// app.use('/users', usersRouter);
// app.use('/subadmin', subAdminRouter);
// app.use('/driver', driverRouter);
app.use("/api", apiRouter);

// catch 404 and forward to error handler

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

app.use((req, res, next) => {
  res.send({
    code: 404,
    message: "Request Not Found",
  });
});

const PORT = process.env.PORT;
httpServer.listen(PORT, () =>
  console.log(`app listening at http://localhost:${PORT}`)
);

app.use(function (req, res, next) {
  next(createError(404));
});

io.on("connection", (socket) => {
  socket.on("addWebNewDriver", async ({ token }) => {
    try {
      await driver_model.updateMany(
        { webSocketId: socket.id },
        {
          $set: {
            isWebSocketConnected: false,
            webSocketId: null,
          },
        }
      );
      const driverByToken = await driverDetailsByToken(token);

      if (driverByToken) {
        driverByToken.locationUpdatedAt = new Date();
        driverByToken.isWebSocketConnected = true;
        driverByToken.webSocketId = socket.id;
        await driverByToken.save();

        io.to(socket.id).emit("userConnection", {
          code: 200,
          message:
            "connected successfully with addWebNewDriver from website user id: " +
            driverByToken._id,
          socket_id: socket.id,
        });
      }
    } catch (err) {
      console.log("🚀 ~ socket.on ~ err:", err);
    }
  });

  socket.on("addNewDriver", async ({ token, longitude, latitude }) => {
    try {
      await driver_model.updateMany(
        { socketId: socket.id },
        {
          $set: {
            isSocketConnected: false,
            socketId: null,
          },
        }
      );
      const driverByToken = await driverDetailsByToken(token);

      if (driverByToken) {
        driverByToken.location = {
          type: "Point",
          coordinates: [longitude, latitude],
        };
        driverByToken.locationUpdatedAt = new Date();
        driverByToken.isSocketConnected = true;
        driverByToken.socketId = socket.id;
        await driverByToken.save();

        io.to(socket.id).emit("driverNotification", {
          code: 200,
          message:
            "connected successfully with addNewDriver driver id: " +
            driverByToken._id,
        });
      }
    } catch (err) {
      console.log("🚀 ~ socket.on ~ err:", err);
    }
  });

  socket.on("addWebUser", async ({ token }) => {
    if (!token || token == "") {
      io.to(socket.id).emit("userConnection", {
        code: 200,
        message: "token is required",
      });

      return;
    }
    try {
      await user_model.updateMany(
        { webSocketId: socket.id },
        {
          $set: {
            isWebSocketConnected: false,
            webSocketId: null,
          },
        }
      );

      const userByToken = await userDetailsByToken(token);

      if (userByToken) {
        userByToken.isWebSocketConnected = true;
        userByToken.webSocketId = socket.id;
        await userByToken.save();
        io.to(socket.id).emit("userConnection", {
                                                  code: 200,
                                                  message:
                                                    "connected successfully with addWebUser from web user id: " +
                                                    userByToken._id,
                                                  socket_id: socket.id,
                                                }
                              );
      }
    } catch (err) {
      console.log("🚀 ~ socket.on ~ err:", err);
    }
  });

  socket.on("addUser", async ({ token }) => {
    if (!token || token == "") {
      io.to(socket.id).emit("userConnection", {
        code: 200,
        message: "token is required",
      });

      return;
    }
    try {
      await user_model.updateMany(
                                  { socketId: socket.id },
                                  {
                                    $set: {
                                      isSocketConnected: false,
                                      socketId: null,
                                    },
                                  }
                                );

      const userByToken = await userDetailsByToken(token);

      if (userByToken) {
        
        userByToken.isSocketConnected = true;
        userByToken.socketId = socket.id;
        await userByToken.save();
        io.to(socket.id).emit("userConnection", {
                                                  code: 200,
                                                  message: "connected successfully with user id: " + userByToken._id,
                                                }
                              );
      }
    } catch (err) {
      console.log("🚀 ~ socket.on ~ err:", err);
    }
  });
  socket.on("companyCancelledTrip", async ({ driverId, trip }) => {
    try {
      const trip_details = await trip_model.findById(trip.result?._id);

      const company_data = await agency_model.findOne({ user_id: trip_details?.created_by_company_id, });

      const driverById = await driver_model.findOne({ _id: driverId, });

      if (driverById?.socketId) {

        await io.to(driverById.socketId).emit("retrivedTrip", {
                                                                message: `Your trip has been retrived by company ${company_data?.company_name}`,
                                                                trip: trip,
                                                              }
                                              );
      }

      if (driverById?.webSocketId) {
        await io.to(driverById?.webSocketId).emit(
                                                    "retrivedTrip",
                                                    {
                                                      message: `Your trip has been retrived by company ${company_data?.company_name}`,
                                                      trip: trip,
                                                    },
                                                    (err, ack) => {
                                                      if (ack) {
                                                      } else {
                                                      }
                                                    }
                                                  );

        await io.to(driverById?.webSocketId).emit(
                                                    "refreshTrip",
                                                    {
                                                      message: "refreshTrip Your trip has been retrived by company",
                                                    },
                                                    (err, ack) => {
                                                      // console.log("err----", err);
                                                      // console.log("ack---------", ack);
                                                      if (ack) {
                                                        // console.log(
                                                        //   "refreshTrip Your trip has been retrived by company.--- driver sockket web-----" +
                                                        //     driverById?.webSocketId
                                                        // );
                                                      } else {
                                                        // console.log(
                                                        //   " getting error in refreshTrip Your trip has been retrived by company. driver sockket web---" +
                                                        //     driverById?.webSocketId
                                                        // );
                                                      }
                                                    }
                                                  );
      }

      if (driverById?.deviceToken) {
        const response = await sendNotification(
                                                  driverById?.deviceToken,
                                                  `Your trip has been retrived by company ${company_data?.company_name}`,
                                                  `Your trip has been retrived by company ${company_data?.company_name}`,
                                                  trip
                                                );
      }
    } catch (err) {
      console.log("🚀 ~ socket.on ~ err:", err);
    }
  });

  socket.on("updateDriverLocation", async ({ longitude, latitude }) => {
    try {
      const driverBySocketId = await driver_model.findOne({
        socketId: socket.id,
      });

      if (driverBySocketId) {
        driverBySocketId.location = {
          type: "Point",
          coordinates: [longitude, latitude],
        };
        driverBySocketId.locationUpdatedAt = new Date();

        await driverBySocketId.save();
        io.to(socket.id).emit("UpdateLocationDriver", {
          code: 200,
          message: "location Updated successfully",
        });
      }
    } catch (error) {
      console.log("🚀 ~ socket.on ~ error:", error);
    }
  });

  socket.on("cancelDriverTrip", async ({ tripId }) => {
    if (!tripId) {
      return io.to(socket.id).emit("driverNotification", {
        code: 200,
        message: "Trip id not valid",
      });
    }

    setTimeout(async () => {
      try {
        const driverBySocketId = await driver_model.findOne({socketId: socket.id,});

        if (driverBySocketId) {
          const trip = await trip_model.findById(tripId);

          if (!trip) {
            return io.to(socket.id).emit("driverNotification", {
                                                                code: 200,
                                                                message: "Trip id not valid",
                                                              }
                                        );
          }

          if (trip.driver_name.toString() == driverBySocketId._id.toString()) {

            driverBySocketId.is_available = true;
            await driverBySocketId.save();

            let updated_data = { trip_status: "Pending", driver_name: null };
            let option = { new: true };
            let update_trip = await trip_model.findOneAndUpdate({ _id: tripId },updated_data,option);

            let user = await user_model.findById(trip?.created_by_company_id);

            if (user.role == "COMPANY") {
              if (user?.socketId) {
                // socket for app
                io.to(user?.socketId).emit("tripCancelledBYDriver", {
                                                                      trip,
                                                                      driver: driverBySocketId,
                                                                      message: "Trip canceled successfully",
                                                                    }
                                          );

                // for refresh trip
                await io.to(user?.socketId).emit(
                                                  "refreshTrip",
                                                  {
                                                    message:
                                                      "Trip Driver didn't accpet the trip. Please refresh the data",
                                                  },
                                                  (err, ack) => {
                                                    // console.log("err----", err);
                                                    // console.log("ack---------", ack);
                                                    if (ack) {
                                                      // console.log(
                                                      //   "refreshTrip Trip canceled successfully by driver.---" +
                                                      //     user?.webSocketId
                                                      // );
                                                    } else {
                                                      // console.log(
                                                      //   "refreshTrip getting error in Trip canceled successfully by driver.---" +
                                                      //     user?.webSocketId
                                                      // );
                                                    }
                                                  }
                                                );
              }

              if (user?.webSocketId) {

                // socket for web
                await io.to(user?.webSocketId).emit(
                                                      "tripCancelledBYDriver",
                                                      {
                                                        trip,
                                                        driver: driverBySocketId,
                                                        message: "Trip canceled successfully",
                                                      },
                                                      (err, ack) => {
                                                        // console.log("err----", err);
                                                        // console.log("ack---------", ack);
                                                        if (ack) {
                                                          // console.log(
                                                          //   "Trip canceled successfully by driver. sending to main company---" +
                                                          //     user?.webSocketId
                                                          // );
                                                        } else {
                                                          // console.log(
                                                          //   " getting error in Trip canceled successfully by driver. sending to main company---" +
                                                          //     user?.webSocketId
                                                          // );
                                                        }
                                                      }
                                                    );

                // for refresh trip
                await io.to(user?.webSocketId).emit(
                                                      "refreshTrip",
                                                      {
                                                        message:
                                                          "Trip Driver didn't accpet the trip. Please refresh the data",
                                                      },
                                                      (err, ack) => {
                                                        // console.log("err----", err);
                                                        // console.log("ack---------", ack);
                                                        if (ack) {
                                                          // console.log(
                                                          //   "refreshTrip Trip canceled successfully by driver.---" +
                                                          //     user?.webSocketId
                                                          // );
                                                        } else {
                                                          // console.log(
                                                          //   "refreshTrip getting error in Trip canceled successfully by driver.---" +
                                                          //     user?.webSocketId
                                                          // );
                                                        }
                                                      }
                                                    );
              }

              if (user?.deviceToken) {
                await sendNotification(
                                        user?.deviceToken,
                                        `Trip canceled by driver ${ driverBySocketId.first_name + " " + driverBySocketId.last_name } and trip ID is ${trip.trip_id}`,
                                        `Trip canceled by driver ${ driverBySocketId.first_name + " " + driverBySocketId.last_name } and trip ID is ${trip.trip_id}`,
                                        driverBySocketId
                                      );
              }

              // console.log("🚀 ~ socket.on ~ response:", response);

              // functionality For assigned driver by company
              const company_assigned_driverIds = user.company_account_access.map((item) => item.driver_id);

              if (company_assigned_driverIds.length > 0) {
                const drivers_info_for_token = await driver_model.find({
                                                                        _id: {
                                                                          $in: company_assigned_driverIds,
                                                                          $ne: driverBySocketId._id,
                                                                        },
                                                                        status: true,
                                                                        deviceToken: { $ne: null }, // device_token should not be null
                                                                      });

                // Send the device notification to assigned drivers
                if (drivers_info_for_token.length > 0) {
                  const company_assigned_driver_token =
                    drivers_info_for_token.map((item) => item.deviceToken);

                  company_assigned_driver_token.forEach(
                                                          async (driver_device_token) => {
                                                            if (driver_device_token) {
                                                              let send_notification = await sendNotification(
                                                                driver_device_token,
                                                                `Trip canceled by driver ${
                                                                  driverBySocketId.first_name +
                                                                  " " +
                                                                  driverBySocketId.last_name
                                                                } and trip ID is ${trip.trip_id}`,
                                                                `Trip canceled by driver ${
                                                                  driverBySocketId.first_name +
                                                                  " " +
                                                                  driverBySocketId.last_name
                                                                } and trip ID is ${trip.trip_id}`,
                                                                driverBySocketId
                                                              );
                                                            }
                                                          }
                                                        );
                }

                // get sockets for app
                const drivers_info_for_socket_ids_app = await driver_model.find(
                                                                                  {
                                                                                    _id: {
                                                                                      $in: company_assigned_driverIds,
                                                                                      $ne: driverBySocketId._id,
                                                                                    },
                                                                                    status: true,
                                                                                    socketId: { $ne: null }, // device_token should not be null
                                                                                  }
                                                                                );

                // get sockets for web
                const drivers_info_for_socket_ids_web = await driver_model.find(
                                                                                  {
                                                                                    _id: {
                                                                                      $in: company_assigned_driverIds,
                                                                                      $ne: driverBySocketId._id,
                                                                                    },
                                                                                    status: true,
                                                                                    webSocketId: { $ne: null }, // device_token should not be null
                                                                                  }
                                                                                );

                // getting only socet id from array
                const company_assigned_driver_sockets_web = drivers_info_for_socket_ids_web.map( (item) => item.webSocketId );

                // getting only socet id from array
                const company_assigned_driver_sockets_app = drivers_info_for_socket_ids_app.map((item) => item.socketId);

                // merge the array in single array
                const driverSocketIds = company_assigned_driver_sockets_web.concat( company_assigned_driver_sockets_app );

                // Send the socket model popo to assigned drivers
                if (driverSocketIds.length > 0) {
                  driverSocketIds.forEach(async (socketId) => {
                                              await io.to(socketId).emit(
                                                "tripCancelledBYDriver",
                                                {
                                                  trip,
                                                  driver: driverBySocketId,
                                                  message: "Trip canceled successfully",
                                                },
                                                (err, ack) => {
                                                  // console.log("err----", err);
                                                  // console.log("ack---------", ack);
                                                  if (ack) {
                                                    // console.log(
                                                    //   "Message successfully delivered to the client. to assigned drivers---" +
                                                    //     socketId
                                                    // );
                                                  } else {
                                                    // console.log(
                                                    //   "Message delivery failed or was not acknowledged by the client. to assigned drivers---" +
                                                    //     socketId
                                                    // );
                                                  }
                                                }
                                              );

                                              await io.to(socketId).emit("refreshTrip", {
                                                message:
                                                  "Driver didn't accpet the trip. Please refresh the data",
                                              });
                                            }
                                        );
                }
              }

              // functionality for the drivers who have account access as partner
              const driverHasCompanyPartnerAccess = await driver_model.find({
                                                                              parnter_account_access : {
                                                                                $elemMatch: { company_id: new mongoose.Types.ObjectId(user._id) },
                                                                              },
                                                                            });

              if (driverHasCompanyPartnerAccess){

                for (let partnerAccount of driverHasCompanyPartnerAccess) {
        
                  // for partner app side
                  if (partnerAccount?.socketId) {
                    await io.to(partnerAccount?.socketId).emit("tripCancelledBYDriver", {
                                                                                          trip,
                                                                                          driver: driverBySocketId,
                                                                                          message: "Trip canceled successfully",
                                                                                        }
                                                              );
                      
                    // for refresh trip
                    await io.to(partnerAccount?.socketId).emit(
                                                                "refreshTrip",
                                                                {
                                                                  message:
                                                                    "Trip Driver didn't accpet the trip. Please refresh the data",
                                                                }
                                                              );
                  }
        
                  // for partner Web side
                  if (partnerAccount?.webSocketId) {
        
                  await io.to(partnerAccount?.webSocketId).emit("tripCancelledBYDriver", {
                                                                                        trip,
                                                                                        driver: driverBySocketId,
                                                                                        message: "Trip canceled successfully",
                                                                                      }
                                                            );
        
                  await io.to(partnerAccount?.webSocketId).emit("refreshTrip",  {
                                                                                  message:
                                                                                    "Trip Driver didn't accpet the trip. Please refresh the data",
                                                                                }
                                                                );
                  }
        
                  // If driver has device token to send the notification otherwise we can get device token his company account if has has company role
                  if (partnerAccount?.deviceToken) {
                    // notification for driver
        
                    await sendNotification(
                                            partnerAccount?.deviceToken,
                                            `Trip canceled by driver ${ driverBySocketId.first_name + " " + driverBySocketId.last_name } and trip ID is ${trip.trip_id}`,
                                            `Trip canceled by driver ${ driverBySocketId.first_name + " " + driverBySocketId.last_name } and trip ID is ${trip.trip_id}`,
                                            driverBySocketId
                                          );
                  } else if (partnerAccount.isCompany){
        
                    const companyData = await user_model.findById(partnerAccount.driver_company_id);
                    if (companyData?.deviceToken) {
                      // notification for company
        
                      await sendNotification(
                                              companyData?.deviceToken,
                                              `Trip canceled by driver ${ driverBySocketId.first_name + " " + driverBySocketId.last_name } and trip ID is ${trip.trip_id}`,
                                              `Trip canceled by driver ${ driverBySocketId.first_name + " " + driverBySocketId.last_name } and trip ID is ${trip.trip_id}`,
                                              driverBySocketId
                                            );
                    }
                  }
                }
              }
            }

            await io.to(socket.id).emit("driverNotification", {
                                                                code: 200,
                                                                message: "Trip canceled successfully",
                                                              });
          }
        }
      } catch (error) {
        console.log("🚀 ~ socket.on ~ error:", error);
        return io.to(socket.id).emit("driverNotification", {
                                                              code: 200,
                                                              message: "There is some",
                                                              error,
                                                            }
                                    );
      }
    }, 300);
  });

  socket.on("acceptDriverTrip", async ({ tripId }) => {

    if (!tripId) {
      return io.to(socket.id).emit("driverNotification",  {
                                                            code: 200,
                                                            message: "Trip id not valid",
                                                          });
    }

    try {
      console.log('accepted the trip by driver')
      const driverBySocketId = await driver_model.findOne({socketId: socket.id});

      if (driverBySocketId) {

        const trip = await trip_model.findById(tripId);

        if (!trip) {
          return io.to(socket.id).emit("driverNotification",  {
                                                                code: 200,
                                                                message: "Trip id not valid",
                                                              });
        }

        // const user = await user_model.findById(trip.created_by).populate("created_by");

        let updated_data = { trip_status: "Booked", status: true };
        let option = { new: true };
        let update_trip = await trip_model.findOneAndUpdate({ _id: tripId },updated_data,option);

        let user = await user_model.findById(trip.created_by_company_id);
        // if (user.role == "HOTEL") {

        if (user.role == "COMPANY") {

          await io.to(user?.socketId).emit("tripAcceptedBYDriver",
                                                                    {
                                                                      trip,
                                                                      message: "Trip accepted successfully",
                                                                    },
                                                                    (err, ack) => {
                                                                      if (ack) {
                                                                        
                                                                      } else {
                                                                        
                                                                      }
                                                                    }
                                          );

            // for refresh trip
            await io.to(user?.socketId).emit("refreshTrip", {
                                                              message:
                                                                "Trip Driver didn't accpet the trip. Please refresh the data",
                                                            }
                                            )

          const response = await sendNotification(user?.deviceToken,
                                                    `Trip accepted by driver and trip ID is ${trip.trip_id}`,
                                                    `Trip accepted by driver and trip ID is ${trip.trip_id}`,
                                                    driverBySocketId
                                                  );

          // console.log("🚀 ~ socket.on ~ response:", response);

          //  Functionality for the assigned driver by company

          const company_assigned_driverIds = user.company_account_access.map((item) => item.driver_id);

          if (company_assigned_driverIds.length > 0) {

            const drivers_info_for_token = await driver_model.find({
                                                                    _id: {
                                                                      $in: company_assigned_driverIds,
                                                                      $ne: driverBySocketId._id,
                                                                    },
                                                                    status: true,
                                                                    deviceToken: { $ne: null }, // device_token should not be null
                                                                  });

            // Send the notification to assigned drivers
            if (drivers_info_for_token.length > 0) {

              const company_assigned_driver_token = drivers_info_for_token.map((item) => item.deviceToken);

              company_assigned_driver_token.forEach(
                                                    async (driver_device_token) => {
                                                      if (driver_device_token) {

                                                        let send_notification = await sendNotification(
                                                                                                          driver_device_token,
                                                                                                          `Trip accepted by driver ${
                                                                                                            driverBySocketId.first_name +
                                                                                                            " " +
                                                                                                            driverBySocketId.last_name
                                                                                                          } and trip ID is ${trip.trip_id}`,
                                                                                                          `Trip canceled by driver ${
                                                                                                            driverBySocketId.first_name +
                                                                                                            " " +
                                                                                                            driverBySocketId.last_name
                                                                                                          } and trip ID is ${trip.trip_id}`,
                                                                                                          driverBySocketId
                                                                                                        );
                                                      }
                                                    }
                                                  );
            }

            // get sockets for app
            const drivers_info_for_socket_ids_app = await driver_model.find({
                                                                              _id: {
                                                                                $in: company_assigned_driverIds,
                                                                                $ne: driverBySocketId._id,
                                                                              },
                                                                              status: true,
                                                                              socketId: { $ne: null }, // device_token should not be null
                                                                            });

            // get sockets for web
            const drivers_info_for_socket_ids_web = await driver_model.find({
                                                                              _id: {
                                                                                $in: company_assigned_driverIds,
                                                                                $ne: driverBySocketId._id,
                                                                              },
                                                                              status: true,
                                                                              webSocketId: { $ne: null }, // device_token should not be null
                                                                            });

            // getting only socet id from array
            const company_assigned_driver_sockets_web = drivers_info_for_socket_ids_web.map((item) => item.webSocketId);

            // getting only socet id from array
            const company_assigned_driver_sockets_app = drivers_info_for_socket_ids_app.map((item) => item.socketId);

            // merge the array in single array
            const driverSocketIds = company_assigned_driver_sockets_web.concat(company_assigned_driver_sockets_app);

            // Send the socket to assigned drivers
            if (driverSocketIds.length > 0) {
              driverSocketIds.forEach((socketId) => {
                                                      io.to(socketId).emit(
                                                        "tripAcceptedBYDriver",
                                                        {
                                                          trip,
                                                          driver: driverBySocketId,
                                                          message: "Trip accepted successfully",
                                                        },
                                                        (err, ack) => {
                                                          // console.log("err----", err);
                                                          // console.log("ack---------", ack);
                                                          if (ack) {
                                                            // console.log(
                                                            //   "Trip accepted successfully to the assigned driver.---" +
                                                            //     socketId
                                                            // );
                                                          } else {
                                                            // console.log(
                                                            //   "getting error in Trip accepted successfully to the assigned driver.---" +
                                                            //     socketId
                                                            // );
                                                          }
                                                        }
                                                      );
                                                    }
                                        );
            }
          }

          // functionality for the drivers who have account access as partner

          const driverHasCompanyPartnerAccess = await driver_model.find({
                                                                          parnter_account_access  : {
                                                                                                      $elemMatch: { company_id: new mongoose.Types.ObjectId(user._id) },
                                                                                                    },
                                                                        });

          if (driverHasCompanyPartnerAccess){

            for (let partnerAccount of driverHasCompanyPartnerAccess) {
              
              
              // for partner app side
              if (partnerAccount?.socketId) {

                console.log('app side send------' ,partnerAccount?.socketId)
                await io.to(partnerAccount?.socketId).emit("tripAcceptedBYDriver",  {
                                                                                      trip,
                                                                                      message: "Trip accepted successfully",
                                                                                    },
                                                          );

                // for refresh trip
                await io.to(partnerAccount?.socketId).emit("refreshTrip", { message: "Trip Driver didn't accpet the trip. Please refresh the data", } )
              }
    
              // for partner Web side
              if (partnerAccount?.webSocketId) {
    
                await io.to(partnerAccount?.webSocketId).emit("tripAcceptedBYDriver", {
                                                                                        trip,
                                                                                        message: "Trip accepted successfully",
                                                                                      }
                                                              );
    
              }
    
              // If driver has device token to send the notification otherwise we can get device token his company account if has has company role
              if (partnerAccount?.deviceToken) {
                // notification for driver
    
                await sendNotification(
                                        partnerAccount?.deviceToken,
                                        `Trip accepted by driver and trip ID is ${trip.trip_id}`,
                                        `Trip accepted by driver and trip ID is ${trip.trip_id}`,
                                        driverBySocketId
                                      );
              } else if (partnerAccount.isCompany){
    
                const companyData = await user_model.findById(partnerAccount.driver_company_id);
                if (companyData?.deviceToken) {
                  // notification for company
    
                  await sendNotification(
                                          companyData?.deviceToken,
                                          `Trip accepted by driver and trip ID is ${trip.trip_id}`,
                                          `Trip accepted by driver and trip ID is ${trip.trip_id}`,
                                          driverBySocketId
                                        );
                }
              }
            }
          }
        }

        io.to(socket.id).emit("driverNotification", {
                                                      code: 200,
                                                      message: "Trip accepted successfully",
                                                    }
                              );
      }
    } catch (error) {
      console.log("🚀 ~ socket.on ~ error:", error);
      return io.to(socket.id).emit("driverNotification", {
                                                            code: 200,
                                                            message: "There is some error",
                                                          }
                                  );
    }
  });

  socket.on("activeDriverTrip", async ({ tripId }) => {
    if (!tripId) {

      return io.to(socket.id).emit("driverNotification", {
                                                            code: 200,
                                                            message: "Trip id not valid",
                                                          });
    }
    try {
      const driverBySocketId = await driver_model.findOne({
                                                            socketId: socket.id,
                                                          });

      if (driverBySocketId) {

        const trip = await trip_model.findById(tripId);

        if (!trip) {
          return io.to(socket.id).emit("driverNotification", {
                                                                code: 200,
                                                                message: "Trip id not valid",
                                                              });
        }

        if (trip.driver_name.toString() == driverBySocketId._id.toString()) {

          const user = await user_model.findById(trip.created_by).populate("created_by");

          // code commented for some time only untill admin panel will be started

          // if (user.role == "HOTEL") {
          //   io.to(user?.created_by?.socketId).emit("tripActiveBYDriver", {
          //     trip,
          //     message: "Trip active successfully",
          //   });
          //   const response = await sendNotification( user?.created_by?.deviceToken,`Trip start by driver and trip ID is ${trip.trip_id}`,`Trip start by driver and trip ID is ${trip.trip_id}`,driverBySocketId)

          // } else {
          //   io.to(user.socketId).emit("tripActiveBYDriver", {
          //     trip,
          //     message: "Trip active successfully",
          //   });

          //   const response = await sendNotification( user?.deviceToken,`Trip start by driver and trip ID is ${trip.trip_id}`,`Trip start by driver and trip ID is ${trip.trip_id}`,driverBySocketId)

          //   console.log("🚀 ~ socket.on ~ response:", response);
          // }

          io.to(socket.id).emit("driverNotification", {
            code: 200,
            message: "Trip active successfully",
          });
        }
      }
    } catch (error) {
      console.log("🚀 ~ socket.on ~ error:", error);
      return io.to(socket.id).emit("driverNotification", {
        code: 200,
        message: "There is some",
      });
    }
  });


  socket.on("disconnect", async (reason) => {
    try {
      setTimeout(async () => {
        const driverBySocketId = await driver_model.findOne({
          socketId: socket.id,
        });

        if (driverBySocketId) {
          
          driverBySocketId.isSocketConnected = false;
          driverBySocketId.socketId = null;

          await driverBySocketId.save();

          setTimeout(() => {
            OfflineDriver(driverBySocketId);
          }, 60 * 1000);
        }
      }, 3000);
    } catch (error) {
      console.log("🚀 ~ socket.disconnect ~ error:", error);
    }
  });
});

const OfflineDriver = async (driverInfo) => {
  // console.log("🚀 ~ OfflineDriver ~ :--------------", driverInfo._id);
  try {
    const driverData = await driver_model.findOne({
      _id: driverInfo._id,
    });

    if (driverData?.socketId === null) {
      driverData.status = false; // when driver will kill the app then it will not be available to take the trips. driver have to manually change the online / Offline
      await driverData.save();

      // console.log("data saved");
    } else {
      // console.log("he joined again in 60 second");
    }
  } catch (err) {
    console.log("🚀 ~ tripIsBooked ~ err:", err);
  }
};

async function checkTripsAndSendNotifications() {
  try {
    const currentDate = new Date();
    const fifteenMinutesBefore = new Date(currentDate.getTime() + 15 * 60000); // Add 15 minutes in milliseconds  console.log("🚀 ~ checkTripsAndSendNotifications ~ fifteenMinutesBefore:", fifteenMinutesBefore)
    const thirteenMinutesBefore = new Date(currentDate.getTime() + 13 * 60000);
    const trips = await trip_model
      .find({
        pickup_date_time: { $lte: fifteenMinutesBefore },
        pickup_date_time: { $gte: thirteenMinutesBefore },
        fifteenMinuteNotification: false,
      })
      .populate("driver_name");
    const notifications = [];
    const ids = [];
    trips.forEach((trip) => {
      const message = `Your trip have ID ${trip._id} is scheduled in 15 minutes. Please get ready!`;
      ids.push(trip._id);

      if (trip?.driver_name?.deviceToken) {
        notifications.push(
          sendNotification(
            trip?.driver_name?.deviceToken,
            message,
            message,
            trip
          )
        );
      }
    });
    const res = await Promise.all(notifications);

    await trip_model.updateMany(
      { _id: { $in: ids } },
      {
        $set: {
          fifteenMinuteNotification: true,
        },
      }
    );
  } catch (error) {
    console.log("🚀 ~ checkTripsAndSendNotifications ~ error:", error);
  }
}
async function logoutDriverAfterThreeHour() {
  try {
    const now = new Date();
    const threeHoursBefore = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    let user = await driver_model.updateMany(
      { is_login: true, lastUsedToken: { $lte: threeHoursBefore } },
      { $set: { is_login: false } }
    );
  } catch (error) {
    console.log("🚀 ~ logout driver 3 hour ~ error:", error);
  }
}

// Schedule the task using cron
cron.schedule("* * * * *", () => {
  checkTripsAndSendNotifications();
  // logoutDriverAfterThreeHour()
});

module.exports = app;
