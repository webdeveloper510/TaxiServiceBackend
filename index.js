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
const User = require("./models/user/user_model");
const agency_model = require("./models/user/agency_model.js");
var adminRouter = require("./routes/admin");
var usersRouter = require("./routes/users");
var subAdminRouter = require("./routes/subadmin");
var driverRouter = require("./routes/driver");
var apiRouter = require("./routes/index.js");
const { Server } = require("socket.io");
const {
  driverDetailsByToken,
  userDetailsByToken,
  sendNotification,
} = require("./Service/helperFuntion");
const driver_model = require("./models/user/driver_model");
const trip_model = require("./models/user/trip_model.js");
const user_model = require("./models/user/user_model");
const fcm = require("./config/fcm.js");
const { default: axios } = require("axios");
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
});
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
    message: "Request Not Found"
  })
});

const PORT = process.env.PORT;
httpServer.listen(PORT, () =>
  console.log(`app listening at http://localhost:${PORT}`)
);

app.use(function (req, res, next) {
  next(createError(404));
});

io.on("connection", (socket) => {
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
        // console.log("🚀 ~ socket.on ~ add driver token =====", driverByToken)
        io.to(socket.id).emit("driverNotification", {
          code: 200,
          message:
            "connected successfully with driver id: " + driverByToken._id,
        });
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
      console.log("🚀 ~ socket.on ~ token:", token);
      const userByToken = await userDetailsByToken(token);
     

      if (userByToken) {
        await user_model.updateMany(
          { socketId: socket.id },
          {
            $set: {
              isSocketConnected: false,
              socketId: null,
            },
          }
        );
        userByToken.isSocketConnected = true;
        userByToken.socketId = socket.id;
        await userByToken.save();
        io.to(socket.id).emit("userConnection", {
          code: 200,
          message: "connected successfully with user id: " + userByToken._id,
        });
      }
    } catch (err) {
      console.log("🚀 ~ socket.on ~ err:", err);
    }
  });
  socket.on("companyCancelledTrip", async ({ driverId,trip }) => {
    
    try {
      
      const trip_details = await trip_model.findById(trip.result?._id);
      
      // const user = await user_model.findOne({
      //   socketId: socket.id,
      // });

      const company_data = await agency_model.findOne({
        user_id: trip_details?.created_by_company_id,
      });

      console.log("🚀 ~ companyCancelledTrip~ user:", trip_details)
      

      console.log("company_data--------------------------------", company_data)
      const driverById = await driver_model.findOne({
        _id: driverId,
      });

      console.log("🚀 ~companyCancelledTrip~ driverById----------socket-vijay:", driverById)

      io.to(driverById.socketId).emit("retrivedTrip",{
        message: `Your trip has been retrived by company ${company_data?.company_name}`,
        trip: trip
      })
      const response =  await sendNotification(driverById?.deviceToken,`Your trip has been retrived by company ${company_data?.company_name}`,`Your trip has been retrived by company ${company_data?.company_name}`,trip)

    } catch (err) {
      console.log("🚀 ~ socket.on ~ err:", err);
    }
  });

  socket.on("updateDriverLocation", async ({ longitude, latitude }) => {
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
  });

  socket.on("cancelDriverTrip", async ({ tripId }) => {

    if (!tripId) {

      return io.to(socket.id).emit("driverNotification", {code: 200,message: "Trip id not valid",});
    }

    try {

      const driverBySocketId = await driver_model.findOne({socketId: socket.id,});

      console.log("🚀 ~ socket.on ~ driverBySocketId:", driverBySocketId);

      if (driverBySocketId) {

        const trip = await trip_model.findById(tripId);
        console.log("🚀 ~ socket.on ~ trip:", trip);

        if (!trip) {

          return io.to(socket.id).emit("driverNotification", {code: 200,message: "Trip id not valid",});
        }

        if (trip.driver_name.toString() == driverBySocketId._id.toString()) {
          driverBySocketId.is_available = true;
          await driverBySocketId.save();

          let updated_data = {trip_status: "Pending" , driver_name: null};
          let option = { new: true };
          let update_trip = await trip_model.findOneAndUpdate({ _id: tripId }, updated_data, option);

          let user = await user_model.findById(trip?.created_by_company_id);
          if (user.role == "COMPANY") {
            io.to(user?.socketId).emit("tripCancelledBYDriver", {
              trip,
              driver:driverBySocketId,
              message: "Trip canceled successfully",
            });
            
            const response = await sendNotification(user?.deviceToken,`Trip canceled by driver ${driverBySocketId.first_name+" "+ driverBySocketId.last_name} and trip ID is ${trip.trip_id}`,`Trip canceled by driver ${driverBySocketId.first_name+" "+ driverBySocketId.last_name} and trip ID is ${trip.trip_id}`,driverBySocketId)
            // console.log("🚀 ~ socket.on ~ response:", response);
            

            // functionality For assigned driver by company
            const company_assigned_driverIds = user.company_account_access.map(item => item.driver_id);

            if (company_assigned_driverIds.length > 0) {

              const drivers_info_for_token = await driver_model.find({
                _id: { $in: company_assigned_driverIds  , $ne: driverBySocketId._id},
                status: true,
                deviceToken: { $ne: null } // device_token should not be null
              });

              const drivers_info_for_socket_ids = await driver_model.find({
                _id: { $in: company_assigned_driverIds , $ne: driverBySocketId._id },
                status: true,
                socketId: { $ne: null } // device_token should not be null
              });


              // Send the device notification to assigned drivers
              if (drivers_info_for_token.length > 0) {

                const company_assigned_driver_token = drivers_info_for_token.map(item => item.deviceToken);
                
                company_assigned_driver_token.forEach( async (driver_device_token) => {

                  if (driver_device_token) {

                    let send_notification = await sendNotification(driver_device_token,`Trip canceled by driver ${driverBySocketId.first_name+" "+ driverBySocketId.last_name} and trip ID is ${trip.trip_id}`,`Trip canceled by driver ${driverBySocketId.first_name+" "+ driverBySocketId.last_name} and trip ID is ${trip.trip_id}`,driverBySocketId)
                  }
                });
                
              }

              // Send the socket model popo to assigned drivers
              if (drivers_info_for_socket_ids.length > 0) {
                
                const company_assigned_driver_sockets = drivers_info_for_socket_ids.map(item => item.socketId);
                
                company_assigned_driver_sockets.forEach(socketId => {
                  io.to(socketId).emit("tripCancelledBYDriver", {
                    trip,
                    driver:driverBySocketId,
                    message: "Trip canceled successfully",
                  });
                });
              }
              
            }
          }

          io.to(socket.id).emit("driverNotification", {
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
        error
      });
    }
  });

  socket.on("acceptDriverTrip", async ({ tripId }) => {
    
    if (!tripId) {

      return io.to(socket.id).emit("driverNotification", {code: 200,message: "Trip id not valid",});
    }

    try {
      const driverBySocketId = await driver_model.findOne({socketId: socket.id});

      console.log("🚀 ~ socket.on ~ driverBySocketId:", driverBySocketId);

      if (driverBySocketId) {

        const trip = await trip_model.findById(tripId);
    
        console.log("🚀 ~ socket.on ~ trip:", trip);

        if (!trip) {

          return io.to(socket.id).emit("driverNotification", {code: 200,message: "Trip id not valid",});
        }

        // const user = await user_model.findById(trip.created_by).populate("created_by");

        
        let updated_data = {trip_status: "Booked" , status: true};
        let option = { new: true };
        let update_trip = await trip_model.findOneAndUpdate({ _id: tripId }, updated_data, option);

        let user = await user_model.findById(trip.created_by_company_id);
        // if (user.role == "HOTEL") {

        if (user.role == "COMPANY") {
          io.to(user?.socketId).emit("tripAcceptedBYDriver", {
            trip,
            message: "Trip accepted successfully",
          });
          const response = await sendNotification( user?.deviceToken,`Trip accepted by driver and trip ID is ${trip.trip_id}`,`Trip accepted by driver and trip ID is ${trip.trip_id}`,driverBySocketId) 
           
          console.log("🚀 ~ socket.on ~ response:", response);
          

          //  Functionality for the assigned driver by company

          const company_assigned_driverIds = user.company_account_access.map(item => item.driver_id);

            if (company_assigned_driverIds.length > 0) {

              const drivers_info_for_token = await driver_model.find({
                _id: { $in: company_assigned_driverIds , $ne: driverBySocketId._id },
                status: true,
                deviceToken: { $ne: null } // device_token should not be null
              });

              const drivers_info_for_socket_ids = await driver_model.find({
                _id: { $in: company_assigned_driverIds  , $ne: driverBySocketId._id},
                status: true,
                socketId: { $ne: null } // device_token should not be null
              });

              console.log("drivers_info_for_socket_ids----------" , drivers_info_for_socket_ids)
              // Send the notification to assigned drivers
              if (drivers_info_for_token.length > 0) {

                const company_assigned_driver_token = drivers_info_for_token.map(item => item.deviceToken);
                
                company_assigned_driver_token.forEach( async (driver_device_token) => {

                  if (driver_device_token) {

                    let send_notification = await sendNotification(driver_device_token,`Trip accepted by driver ${driverBySocketId.first_name+" "+ driverBySocketId.last_name} and trip ID is ${trip.trip_id}`,`Trip canceled by driver ${driverBySocketId.first_name+" "+ driverBySocketId.last_name} and trip ID is ${trip.trip_id}`,driverBySocketId)
                  }
                });
              }

              // Send the socket to assigned drivers
              if (drivers_info_for_socket_ids.length > 0) {
                
                const company_assigned_driver_sockets = drivers_info_for_socket_ids.map(item => item.socketId);
                
                company_assigned_driver_sockets.forEach(socketId => {
                  io.to(socketId).emit("tripAcceptedBYDriver", {
                    trip,
                    driver:driverBySocketId,
                    message: "Trip accepted successfully",
                  });
                });
              }
            }
        }

        io.to(socket.id).emit("driverNotification", {
          code: 200,
          message: "Trip accepted successfully",
        });
      }
    } catch (error) {
      console.log("🚀 ~ socket.on ~ error:", error);
      return io.to(socket.id).emit("driverNotification", {
        code: 200,
        message: "There is some",
      });
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
      console.log("🚀 ~ socket.on ~ driverBySocketId:", driverBySocketId);
      if (driverBySocketId) {
        const trip = await trip_model.findById(tripId);
        console.log("🚀 ~ socket.on ~ trip:", trip);
        if (!trip) {
          return io.to(socket.id).emit("driverNotification", {
            code: 200,
            message: "Trip id not valid",
          });
        }

        if (trip.driver_name.toString() == driverBySocketId._id.toString()) {
          const user = await user_model
            .findById(trip.created_by)
            .populate("created_by");
          
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
  socket.on("disconnect", async () => {
    try {
      const driverBySocketId = await driver_model.findOne({
        socketId: socket.id,
      });
      console.log("🚀 ~ socket driver disconnected ~ driverBySocketId:", driverBySocketId)
      if (driverBySocketId) {
        driverBySocketId.isSocketConnected = false;
        driverBySocketId.socketId = null;
        await driverBySocketId.save();
      }
    } catch (error) {
      console.log("🚀 ~ socket.on ~ error:", error)
      
    }
  });
});

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
    const threeHoursBefore = new Date(now.getTime() - 3 *60 * 60 * 1000);
  let user = await driver_model.updateMany({is_login:true,lastUsedToken:{$lte:threeHoursBefore}},{$set:{is_login:false}});
  
  } catch (error) {
    console.log("🚀 ~ logout driver 3 hour ~ error:", error);
  }
}

// Schedule the task using cron
cron.schedule("* * * * *", ()=>{
  checkTripsAndSendNotifications();
  // logoutDriverAfterThreeHour()
});

module.exports = app;
