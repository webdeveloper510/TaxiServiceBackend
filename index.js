require("dotenv").config();
var createError = require("http-errors");
var express = require("express");
const bodyParser = require('body-parser');
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
const db = require("./config/db");
const http = require("http");
const cors = require("cors");
const SETTING_MODEL = require('./models/user/setting_model');
const CAR_TYPE_MODEL = require('./models/admin/car_type_model');
var apiRouter = require("./routes/index.js");
const { Server } = require("socket.io");
const { driverDetailsByToken,
        emitTripCancelledByDriver,
        emitTripRetrivedByCompany,
        emitTripAcceptedByDriver,
      } = require("./Service/helperFuntion");
const driver_model = require("./models/user/driver_model");
const trip_model = require("./models/user/trip_model.js");
const user_model = require("./models/user/user_model");
const mongoose = require("mongoose");
var app = express();
app.use(cors());
const jwt = require("jsonwebtoken");
const constant = require("./config/constant.js");
const httpServer = http.createServer(app);
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const i18n = require('./i18n');
const { startAllCrons } = require("./cronjobs");
// view engine setup



// Apply raw body parser specifically for Stripe webhook

const payoutWebhook = require('./routes/webhooks/payoutWebhook'); // exports webhook handler function
app.post('/payout_webhook', bodyParser.raw({ type: 'application/json' }), payoutWebhook); // webhook for compnay payout

const subscriptionWebhook = require('./routes/webhooks/subscription.webhook'); // exports webhook handler function
app.post('/subscription_webhook', bodyParser.raw({ type: 'application/json' }), subscriptionWebhook); // webhook for subscription and chekcout


// 
startAllCrons();
app.use(logger("dev"));
app.use(i18n.init);
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
  
  const lang = req.query.lang || req.headers['accept-language'];
  if (lang) {
    req.setLocale(lang);
  }
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
app.get('/', (req, res) => {
  res.send('API is working');
});

app.use(function (err, req, res, next) {
  
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});


app.get( "/weekly-company-payment", async (req, res) => {

  try {
    
    return res.send({
                      code: 200,
                      message: "weekly-company-payment"
                    });
  } catch (error) {
    console.error("Error weekly-company-payment:", error);
    return  res.send({
                        code: constant.error_code,
                        message: error.message,
                    });
  }
})


app.use((req, res, next) => {
  res.send({
    code: 404,
    message: "Request Not Found",
  });
});


const PORT = process.env.PORT;
httpServer.listen(PORT, async() => {
    console.log(`app listening at http://localhost:${PORT}`)
    await SETTING_MODEL.seedDefaults();
    await CAR_TYPE_MODEL.seedDefaults();
  }
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
                                                }
                              );
      }
    } catch (err) {
      console.log("🚀 ~ socket.on ~ addWebNewDriver err:", err);
    }
  });

  socket.on("addNewDriver", async ({ token, longitude, latitude ,socketId }) => {
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
        driverByToken.socketId = socketId;
        await driverByToken.save();

        // If compaany has driver account then socket will be updated in driver document
        const updatedDriver = await user_model.findOneAndUpdate(
                                                                    { email: driverByToken?.email },
                                                                    {
                                                                      $set: {
                                                                        isSocketConnected: true,
                                                                        socketId: socketId,
                                                                      },
                                                                    },
                                                                    { new: true } // Return the updated document
                                                                  );

        await io.to(socketId).emit("driverNotification", {
                                                            code: 200,
                                                            message:
                                                              "connected successfully with addNewDriver driver id: " +
                                                              driverByToken._id,
                                                          }
                                  );
      }
    } catch (err) {
      console.log("🚀 ~ socket.on ~ addNewDriver err:", err);
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

      let socketId = socket.id;
      const tokenData  = jwt.verify(token, process.env.JWTSECRET);
      const id = tokenData?.companyPartnerAccess ? tokenData?.CompanyPartnerDriverId : tokenData?.userId;
                            
      if (tokenData?.companyPartnerAccess) { // If driver accessing the company account as Partner
        
        const driver = await driver_model.findOne({ _id: id });
        if (driver) {

          const driver = await driver_model.findByIdAndUpdate(
                                                              id,
                                                              {
                                                                $set: {
                                                                  isWebSocketConnected: true,
                                                                  webSocketId: socketId
                                                                }
                                                              },
                                                              { new: true } // returns the updated driver document
                                                            );

          await io.to(socketId).emit("userConnection",  {
                                                    code: 200,
                                                    message: "connected successfully with user id: " + id,
                                                    user:driver,
                                                    socketId:socketId
                                                  }
                              );
        }
        
        
      } else { // when company accessing his account

        const user = await user_model.findOne({ _id: id });

        if (user) {

          const user = await user_model.findByIdAndUpdate(
                                                              id,
                                                              {
                                                                $set: {
                                                                  isWebSocketConnected: true,
                                                                  webSocketId: socketId
                                                                }
                                                              },
                                                              { new: true } // returns the updated driver document
                                                            );

          await io.to(socketId).emit("userConnection",  {
                                                    code: 200,
                                                    message: "connected successfully with user id: " + id,
                                                    user:user,
                                                    socketId:socketId
                                                  }
                              );
        }
        
      }

    } catch (err) {
      console.log("🚀 ~ socket.on ~ addWebUser err:", err);
    }
  });

  socket.on("addUser", async ({ token , socketId }) => {

   
    if (!token || token == "") {
      io.to(socket.id).emit("userConnection", {
        code: 200,
        message: "token is required",
      });
 
    }
    try {
      await user_model.updateMany(
                                    { socketId: socketId },
                                    {
                                      $set: {
                                        isSocketConnected: false,
                                        socketId: null,
                                      },
                                    }
                                  );
      
      const tokenData  = jwt.verify(token, process.env.JWTSECRET);
      const id = tokenData?.companyPartnerAccess ? tokenData?.CompanyPartnerDriverId : tokenData?.userId;

      if (tokenData?.companyPartnerAccess) { // If driver accessing the company account as Partner
        
        const driver = await driver_model.findOne({ _id: id });
        if (driver) {

          // driver.isSocketConnected = true;
          // driver.socketId = socketId;
          // await driver.save();
          let driverUpdateData = {
            isSocketConnected:true,
            socketId:socketId
          };

          await driver_model.findOneAndUpdate({ _id: id }, {$set: driverUpdateData} , { new: true })
          

          io.to(socketId).emit("userConnection",  {
                                                    code: 200,
                                                    message: "connected successfully with user id: " + id,
                                                  }
                              );
        }
        
        
      } else { // when company accessing his account

        const user = await user_model.findOne({ _id: id });

        if (user) {

          // user.isSocketConnected = true;
          // user.socketId = socketId;
          // await user.save();

          let userUpdateData = {
            isSocketConnected:true,
            socketId:socketId
          };

          await user_model.findOneAndUpdate({ _id: id } , {$set:userUpdateData}, {new : true})

          // If compaany has driver account then socket will be updated in driver document
          const updatedDriver = await driver_model.findOneAndUpdate(
                                                                    { email: user?.email },
                                                                    {
                                                                      $set: {
                                                                        isSocketConnected: true,
                                                                        socketId: socketId,
                                                                      },
                                                                    },
                                                                    { new: true } // Return the updated document
                                                                  );
          io.to(socketId).emit("userConnection",  {
                                                    code: 200,
                                                    message: "connected successfully with user id: " + id,
                                                  }
                              );
        }
        
      }
      

    } catch (err) {
      console.log("🚀 ~ socket.on ~ err: addUser------", err);
    }
  });

  socket.on("companyCancelledTrip", async ({ driverId, trip }) => {
    try {
      const trip_details = await trip_model.findById(trip.result?._id);

      
      if (trip_details) {
        trip_details.driver_name = null;
        await trip_details.save(); // Save the updated trip details
      }
      const driverById = await driver_model.findOne({ _id: driverId, });
      
      emitTripRetrivedByCompany(trip_details , driverById  , socket.id , io);
      
    } catch (err) {
      console.log("🚀 ~ socket.on companyCancelledTrip ~ err:", err);
    }
  });

  socket.on("updateDriverLocation", async ({ longitude, latitude }) => {
    try {

      const driverBySocketId = await driver_model.findOne({ socketId: socket.id, });
     
      if (driverBySocketId) {
      
        // driverBySocketId.location = {
        //                               type: "Point",
        //                               coordinates: [longitude, latitude],
        //                             };
        // driverBySocketId.locationUpdatedAt = new Date();

        // await driverBySocketId.save();

        const updatedDriver = await driver_model.findOneAndUpdate(
                                                                    { socketId: socket.id },
                                                                    {
                                                                      $set: {
                                                                        location: {
                                                                          type: "Point",
                                                                          coordinates: [longitude, latitude],
                                                                        },
                                                                        locationUpdatedAt: new Date(),
                                                                      },
                                                                    },
                                                                    { new: true } // Return the updated document
                                                                  );

        
        io.to(socket.id).emit("UpdateLocationDriver", {
          code: 200,
          message: "location Updated successfully",
        });
      }
    } catch (error) {
      console.log("🚀 ~ socket.on ~ error: updateDriverLocation-----", error);
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

            // when company will send a request toa driver and pop will show on driver side and driver reject
            if (trip?.trip_status == constant.TRIP_STATUS.APPROVED) { // when trip will not be already booked
              
              driverBySocketId.is_available = true;
              await driverBySocketId.save();

              let updated_data = { trip_status: "Pending", driver_name: null };
              let option = { new: true };
              let update_trip = await trip_model.findOneAndUpdate({ _id: tripId },updated_data,option);
              
            }
            
            emitTripCancelledByDriver(trip , driverBySocketId  , socket.id , io);
          }

          // sendBookingCancelledEmail(trip)
        }
      } catch (error) {
        console.log("🚀 ~ socket.on cancelDriverTrip index ~ error:", error);
        return io.to(socket.id).emit("driverNotification", {
                                                              code: 200,
                                                              message: "There is some error",
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

        

        await io.to(socket.id).emit("refreshTrip", { message: "You have accepted the trip. Please refresh the data to view the updates", } )
        io.to(socket.id).emit("driverNotification", {
                                                      code: 200,
                                                      message: "Trip accepted successfully",
                                                    }
                              );
        
        emitTripAcceptedByDriver(update_trip , driverBySocketId , socket.id , io)
       
      }
    } catch (error) {
      console.log("🚀 ~ socket.on AcceptDriver Trip ~ error:", error);
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

          io.to(socket.id).emit("driverNotification", {
            code: 200,
            message: "Trip active successfully",
          });
        }
      }
    } catch (error) {
      console.log("🚀 ~ socket.on ~ error:activeDriverTrip---", error);
      return io.to(socket.id).emit("driverNotification", {
        code: 200,
        message: "There is some",
      });
    }
  });


  socket.on("disconnect", async (reason) => {
    try {
      
      setTimeout(async () => {
        const driverBySocketId = await driver_model.findOne({ socketId: socket.id});

        if (driverBySocketId) {
          
          driverBySocketId.isSocketConnected = false;
          driverBySocketId.socketId = null;

          await driverBySocketId.save();

          // If driver kill the app (or internet is not working)  and driver will not open (or connect to the internet) in 2 minutes then server will show the driver as oofline 
          setTimeout(() => {
            OfflineDriver(driverBySocketId);
          }, 30 * 1000);
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
    const driverData = await driver_model.findOne({ _id: driverInfo._id});


    if (driverData?.socketId === null) {
      driverData.status = false; // when driver will kill the app then it will not be available to take the trips. driver have to manually change the online / Offline
      console.log('status changed--------------------------------------------------------------')
      await driverData.save();
    }
  } catch (err) {
    console.log("🚀 ~ tripIsBooked ~ err:", err);
  }
};

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




// Schedule the task using cron for every minute
// cron.schedule("* * * * *", () => {
  
//   // logoutDriverAfterThreeHour()
// });

module.exports = app;
