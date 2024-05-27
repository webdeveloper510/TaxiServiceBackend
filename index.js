require("dotenv").config();
var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cron = require("node-cron")
const db = require("./config/db");
const http = require("http");
const cors = require("cors");
const User = require("./models/user/user_model");
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
app.use(function (req, res, next) {
  next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

const PORT = process.env.PORT;
httpServer.listen(PORT, () =>
  console.log(`app listening at http://localhost:${PORT}`)
);

io.on("connection", (socket) => {
  socket.on("addNewDriver", async ({ token, longitude, latitude }) => {
    try {
      const driverByToken = await driverDetailsByToken(token);
      console.log(
        "🚀 ~ file: index.js:70 ~ socket.on ~ driverByToken:",
        driverByToken
      );

      if (driverByToken) {
        await driver_model.updateMany(
          { socketId: socket.id },
          {
            $set: {
              isSocketConnected: false,
              socketId: null,
            },
          }
        );
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
      console.log("🚀 ~ socket.on ~ token:", token);
      const userByToken = await userDetailsByToken(token);
      console.log(
        "🚀 ~ file: index.js:70 ~ socket.on ~ driverByToken:",
        userByToken
      );

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
          trip.driver_name = null;
          trip.trip_status = "Pending";
          await trip.save();
          const user = await user_model
            .findById(trip.created_by)
            .populate("created_by");
          if ((user.role == "HOTEL")) {
            io.to(user?.created_by?.socketId).emit("tripCancelledBYDriver", {
              trip,
              message: "Trip canceled successfully",
            });
            //   await  fcm.send({
            //     // to: user?.created_by?.deviceToken,
            //     to: user?.created_by?.deviceToken,
            //     data: {
            //         message: "Trip canceled by driver",
            //         title:"Trip canceled by driver",
            //         trip,
            //         driver:driverBySocketId
            //     }
            // })
            const response = await axios.post(
              "https://fcm.googleapis.com/fcm/send",
              {
                to: user?.created_by?.deviceToken,
                notification: {
                  message: `Trip canceled by driver and trip ID is ${trip.trip_id}`,
                  title: `Trip canceled by driver and trip ID is ${trip.trip_id}`,
                  trip,
                  driver: driverBySocketId,
                  sound: "default"
                },
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  Authorization:
                    `key=${process.env.FCM_SERVER_KEY}`,
                },
              }
            );
            console.log("🚀 ~ socket.on ~ response:", response)
          } else {
            io.to(user.socketId).emit("tripCancelledBYDriver", {
              trip,
              message: "Trip canceled successfully",
            });
            // await fcm.send({
            //   to: user?.deviceToken,
            //   data: {
            //     message: "Trip canceled by driver",
            //     title: "Trip canceled by driver",
            //     trip,
            //     driver: driverBySocketId,
            //   },
            // });
            const response = await axios.post(
              "https://fcm.googleapis.com/fcm/send",
              {
                to:user?.deviceToken,
                notification: {
                  message:  `Trip canceled by driver and trip ID is ${trip.trip_id}`,
                  title:  `Trip canceled by driver and trip ID is ${trip.trip_id}`,
                  trip,
                  driver: driverBySocketId,
                  sound: "default"
                },
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  Authorization:
                    `key=${process.env.FCM_SERVER_KEY}`,
                },
              }
            );
            console.log("🚀 ~ socket.on ~ response:", response)
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
          if ((user.role == "HOTEL")) {
            io.to(user?.created_by?.socketId).emit("tripActiveBYDriver", {
              trip,
              message: "Trip active successfully",
            });
            const response = await axios.post(
              "https://fcm.googleapis.com/fcm/send",
              {
                to: user?.created_by?.deviceToken,
                notification: {
                  message:  `Trip start by driver and trip ID is ${trip.trip_id}`,
                  title:  `Trip start by driver and trip ID is ${trip.trip_id}`,
                  trip,
                  driver: driverBySocketId,
                  sound: "default"
                },
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  Authorization:
                    `key=${process.env.FCM_SERVER_KEY}`,
                },
              }
            );
            console.log("🚀 ~ socket.on ~ response:", response)
          } else {
            io.to(user.socketId).emit("tripActiveBYDriver", {
              trip,
              message: "Trip active successfully",
            });
            // await fcm.send({
            //   to: user?.deviceToken,
            //   data: {
            //     message: "Trip canceled by driver",
            //     title: "Trip canceled by driver",
            //     trip,
            //     driver: driverBySocketId,
            //   },
            // });
            const response = await axios.post(
              "https://fcm.googleapis.com/fcm/send",
              {
                to:user?.deviceToken,
                notification: {
                  message: `Trip start by driver and trip ID is ${trip.trip_id}`,
                  title: `Trip start by driver and trip ID is ${trip.trip_id}`,
                  trip,
                  driver: driverBySocketId,
                  sound: "default"
                },
              },
              {
                headers: {
                  "Content-Type": "application/json",
                  Authorization:
                    `key=${process.env.FCM_SERVER_KEY}`,
                },
              }
            );
            console.log("🚀 ~ socket.on ~ response:", response)
          }
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
    const driverBySocketId = await driver_model.findOne({
      socketId: socket.id,
    });
    if (driverBySocketId) {
      driverBySocketId.isSocketConnected = false;
      driverBySocketId.socketId = null;
      await driverBySocketId.save();
    }
  });
});

async function checkTripsAndSendNotifications() {
  try {
    console.log("cron job running every minute")
    const currentDate = new Date();
    const fifteenMinutesBefore = new Date(currentDate.getTime() + 15 * 60000); // Add 15 minutes in milliseconds  console.log("🚀 ~ checkTripsAndSendNotifications ~ fifteenMinutesBefore:", fifteenMinutesBefore)
    const thirteenMinutesBefore = new Date(currentDate.getTime() + 13 * 60000);
  const trips = await trip_model.find({ pickup_date_time: { $lte: fifteenMinutesBefore },pickup_date_time:{$gte:thirteenMinutesBefore},fifteenMinuteNotification:false }).populate("driver_name");
  console.log("🚀 ~ checkTripsAndSendNotifications ~ trips:", trips)
  const notifications = [];
  const ids = []
  trips.forEach(trip => {
    const message = `Your trip have ID ${trip._id} is scheduled in 15 minutes. Please get ready!`;
    ids.push(trip._id);
    
    if(trip?.driver_name?.deviceToken){
      notifications.push(sendNotification(trip?.driver_name?.deviceToken,message,message,trip))
    }
    

  });
  const res = await Promise.all(notifications);
    console.log("🚀 ~ checkTripsAndSendNotifications ~ res:", res)
    await trip_model.updateMany({_id:{$in:ids}},{$set:{
      fifteenMinuteNotification:true
    }})
  } catch (error) {
    console.log("🚀 ~ checkTripsAndSendNotifications ~ error:", error)
    
  }
}

// Schedule the task using cron
cron.schedule('* * * * *', checkTripsAndSendNotifications);



module.exports = app;





