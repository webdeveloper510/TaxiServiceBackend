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
const LOGS = require("./models/user/logs_model"); // Import the Driver model
const SETTING_MODEL = require('./models/user/setting_model');
const CAR_TYPE_MODEL = require('./models/admin/car_type_model');
var apiRouter = require("./routes/index.js");
const { Server } = require("socket.io");
const { driverDetailsByToken,
        sendNotification, 
        sendPaymentFailEmail , 
        sendEmailSubscribeSubcription,
        emitTripCancelledByDriver,
        emitTripRetrivedByCompany,
        emitTripAcceptedByDriver,
      } = require("./Service/helperFuntion");
const driver_model = require("./models/user/driver_model");
const trip_model = require("./models/user/trip_model.js");
const user_model = require("./models/user/user_model");
const SUBSCRIPTION_MODEL = require("./models/user/subscription_model");
const PLANS_MODEL = require("./models/admin/plan_model");
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
app.post('/payout_webhook', bodyParser.raw({ type: 'application/json' }), payoutWebhook);

const subscriptionWebhook = require('./routes/webhooks/subscription.webhook'); // exports webhook handler function
app.post('/subscription_webhook', bodyParser.raw({ type: 'application/json' }), subscriptionWebhook);

// app.post( "/subscription_webhook", bodyParser.raw({type: 'application/json'}), async (req, res) => {

//   console.log('webhook triggered----------------')
//   const istTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });  
//     try {
         
//         const endpointSecret = process.env.STRIPE_TEST_WEBHOOK_ENDPOINT_SECRET;
          
//           const sig = req.headers['stripe-signature'];
//           let event;

//           try {
//             event = await stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
//             console.log("Webhook received successfully----" , event.type);
//             // console.log("Webhook JSON.stringify----" , JSON.stringify(event));
//           } catch (err) {
//             console.log(`Webhook Error: ${err.message}`);

//             let logs_data = { api_name: 'subscription_webhook', payload: JSON.stringify(req.body),
//                               error_message: err.message, error_response: JSON.stringify(err)
//                             };

//             const logEntry = new LOGS(logs_data);
//             logEntry.save();
//             return res.status(200).send({ received: true , error_message: err.message , istTime:istTime});
//           }

//           // -------------------- Main Logic start
//           console.log('event.type-------up' , event.type)
//           let logs_data = { api_name: 'subscription_webhook', payload: event.type, error_message: `webhook`, error_response: JSON.stringify(event) };
//           const logEntry = new LOGS(logs_data);
//           logEntry.save();


//           if (event.type === 'invoice.payment_succeeded') {
//             let invoice = event.data.object;
//             let updateData;

//             if (invoice.billing_reason === "subscription_create") {

//               // Extract relevant information
//               let subscriptionId = invoice.subscription; // Subscription ID

//               let subscriptionExist = await SUBSCRIPTION_MODEL.findOne({subscriptionId:subscriptionId , paid: constant.SUBSCRIPTION_PAYMENT_STATUS.UNPAID })
              

//               let paymentIntentId = invoice.payment_intent;

//               const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

//               const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);

//               if (paymentMethod.type === 'ideal' ||  paymentMethod.type === 'sepa_debit') {
//                 console.log('This subscription was created using iDEAL.' , paymentMethod.type);

//                 // Store this info in your database if needed
//                 await idealPaymentSubscription(req , invoice , paymentMethod.type);
//               } else {

//                 updateData =  {
//                   chargeId: invoice.charge,
//                   paymentIntentId: invoice.payment_intent,
//                   invoiceId: invoice.id,
//                   paid: constant.SUBSCRIPTION_PAYMENT_STATUS.PAID,
//                   active: constant.SUBSCRIPTION_STATUS.ACTIVE,
//                   invoicePdfUrl: invoice.invoice_pdf,
//                   invoiceUrl: invoice.hosted_invoice_url,
//                   billing_reason: `subscription_create`
//                 }

//                 const result = await SUBSCRIPTION_MODEL.updateOne(
//                                                                       { _id: new mongoose.Types.ObjectId(subscriptionExist._id) }, // filter
//                                                                       { $set: updateData } // update operation
//                                                                   );

//                 let logs_data = {
//                                   api_name: 'subscription_webhook',
//                                   payload: event.type,
//                                   error_message: `billing_reason - subscription_create`,
//                                   error_response: JSON.stringify(event)
//                                 };

//                 const logEntry = new LOGS(logs_data);
//                 logEntry.save();

//                 // Send subscription email to user
//                 sendEmailSubscribeSubcription(subscriptionId);
//               }

//             } else if (invoice.billing_reason === "subscription_cycle") {

//               // Extract relevant information
//               const subscriptionId = invoice.subscription; // Subscription ID

//               let subscriptionExist = await SUBSCRIPTION_MODEL.findOne({subscriptionId:subscriptionId})

//               const subscriptionLine = await invoice.lines.data.find(line => line.type === 'subscription');
//               // Convert UNIX timestamps to JavaScript Date objects
//               const startPeriod = new Date(subscriptionLine.period.start * 1000); // Convert to milliseconds
//               const endPeriod = new Date(subscriptionLine.period.end * 1000);

              
//               let option = { new: true };

//               // Set inactive to old entry related to this subscription ID because new Entry will start
//               SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId:subscriptionId} , {active: constant.SUBSCRIPTION_STATUS.INACTIVE} ,option);

//               updateData =  {
//                               subscriptionId:invoice.subscription,
//                               planId: subscriptionExist.planId,
//                               productPriceId: subscriptionExist.priceId,
//                               customerId: subscriptionExist.customerId,
//                               role: subscriptionExist.role,
//                               purchaseBy: subscriptionExist.purchaseBy,
//                               amount: subscriptionExist.amount,
//                               billing_reason: `subscription_cycle`,
//                               startPeriod: startPeriod,
//                               endPeriod: endPeriod,
//                               chargeId: invoice.charge,
//                               paymentIntentId: invoice.payment_intent,
//                               invoiceId: invoice.id,
//                               paid: constant.SUBSCRIPTION_PAYMENT_STATUS.PAID,
//                               active: constant.SUBSCRIPTION_STATUS.ACTIVE,
//                               invoicePdfUrl: invoice.invoice_pdf,
//                               invoiceUrl: invoice.hosted_invoice_url,
//                             };

//               const subscriptionRenewal = new SUBSCRIPTION_MODEL(updateData);
//               subscriptionRenewal.save();

//               let logs_data = {
//                 api_name: 'subscription_webhook',
//                 payload: event.type,
//                 error_message: `billing_reason - subscription_cycle`,
//                 error_response: JSON.stringify(event)
//               };
//               const logEntry = new LOGS(logs_data);
//               logEntry.save();

//             } else if (invoice.billing_reason === "checkout" || invoice.billing_reason === "manual") {
//               console.log("💳 This invoice is for a **One-Time Payment**");

//               const checkoutSessions = await stripe.checkout.sessions.list({
//                                                                             payment_intent: invoice.payment_intent, // Find session with this invoice
//                                                                             limit: 1,
//                                                                           });

//               if (checkoutSessions.data.length > 0) {

//                 const checkoutSessionsId = checkoutSessions.data[0].id;
//                 console.log("🔗 This invoice belongs to Checkout Session:", checkoutSessionsId);

//                 const condition = { "stripe_payment.payment_intent_id": checkoutSessionsId };
//                 const invoiceUpdateData = { 
//                                             $set: {
//                                               hosted_invoice_url: invoice?.hosted_invoice_url,
//                                               invoice_pdf: invoice?.invoice_pdf,
//                                             } 
//                                           };
//                 const option = { new: true } 
//                 //  Update invoice URL into our system
//                 const updatedTrip = await trip_model.findOneAndUpdate(
//                                                                         condition, // Find condition
//                                                                         invoiceUpdateData, 
//                                                                         option // Returns the updated document
//                                                                       );
//                 console.log('cheikng find update-----------')
//                 console.log('cheikng find update' , updatedTrip)
//               } else {
//                 console.log("⚠️ No matching Checkout Session found.");
//               }
//             } else {
//               console.log("⚠️ Unknown billing reason:", invoice.billing_reason);
//             }


//           } else if (event.type ===`invoice.payment_failed`) { // when Payment will be failed

//             const invoice = event.data.object;

//             let logs_data = {
//               api_name: 'subscription_webhook',
//               payload: JSON.stringify(event),
//               error_message: `Retry payment`,
//               error_response: JSON.stringify(event)
//             };
//             const logEntry = new LOGS(logs_data);
//             logEntry.save();

//             // Retry payment (optional)
//             // const retryInvoice = await stripe.invoices.pay(invoice.id, {
//             //   off_session: true, // Try charging without user interaction
//             // });

//             // if (retryInvoice.status === "paid") {
//             //   console.log("Retried payment successful");
//             //   let logs_data = {
//             //     api_name: 'subscription_webhook',
//             //     payload: JSON.stringify(event),
//             //     error_message: `Retry payment`,
//             //     error_response: JSON.stringify(event)
//             //   };
//             //   const logEntry = new LOGS(logs_data);
//             //   await logEntry.save();
//             // } else {

//             //   console.log("Retry failed, sending email to user...");
//             //   // Notify the user to update their payment method
//             //   await handleInvoicePaymentFailure(invoice)
//             // }

//             handleInvoicePaymentFailure(invoice)

           
//           } 

          
//           // Log the webhook event
//           console.log("Webhook received successfully");
//           return res.status(200).send({ received: true  , message: `Webhook received successfully for subscription webhook`, istTime:istTime});
//       } catch (error) {
//           console.error(" subscription webhook:", error.message);
//           let logs_data = {
//                             api_name: 'subscription_webhook error',
//                             payload: JSON.stringify(req.body),
//                             error_message: error.message,
//                             error_response: JSON.stringify(error)
//                           };
//           const logEntry = new LOGS(logs_data);
//           logEntry.save();
//           return res.status(200).send({ received: true , error_message: error.message , istTime:istTime});
//       }
//   }
// );

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

app.post( "/send-notification", async (req, res) => {
  let data = req.body
  const userDetails = await user_model.findOne({ email: data.email });
  const noti = sendNotification( userDetails?.deviceToken, `checking notification`, `this is body of the notification`, userDetails );
  return res.send({
    code: 200,
    message: "send-notification",
    deviceToken: userDetails?.deviceToken,
    noti,
    userDetails
  });
})

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

const handleInvoicePaymentFailure = async (invoice) => {

  try {

    // Handle invoice payment failures similarly
    const errorCode = invoice.last_payment_error?.code;
    const subscriptionId = invoice.subscription; // Subscription ID
    let option = { new: true };
    let updatedData;
    switch (errorCode) {
        case 'card_declined':
            console.error('Invoice payment failed: Card was declined.');
            
            updatedData = {
                            active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                            cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.CARD_DECLINED
                          }
            await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
            await sendPaymentFailEmail(subscriptionId , constant.SUBSCRIPTION_CANCEL_REASON.CARD_DECLINED)
            break;
        case 'insufficient_funds':
            console.error('Invoice payment failed: Insufficient funds in the account.');
            
            updatedData = {
                            active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                            cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.INSUFFUCIENT_FUNDS
                          }
            await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
            await sendPaymentFailEmail(subscriptionId , constant.SUBSCRIPTION_CANCEL_REASON.INSUFFUCIENT_FUNDS)
            break;
        case 'expired_card':
            console.error('Invoice payment failed: The card has expired.');
            updatedData = {
                            active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                            cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.EXPIRED_CARD
                          }
            await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
            await sendPaymentFailEmail(subscriptionId , constant.SUBSCRIPTION_CANCEL_REASON.EXPIRED_CARD)
            break;
        case 'card_blocked':
            console.error('Invoice payment failed: The card is blocked.');
            updatedData = {
                            active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                            cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.CARD_BLOCKED
                          }
            await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
            await sendPaymentFailEmail(subscriptionId , constant.SUBSCRIPTION_CANCEL_REASON.CARD_BLOCKED)
            break;
        case 'processing_error':
            console.error('Invoice payment failed: A technical error occurred while processing.');
            updatedData = {
                        active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                        cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.PROCESSING_ERROR
                      }
            await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
            await sendPaymentFailEmail(subscriptionId , constant.SUBSCRIPTION_CANCEL_REASON.PROCESSING_ERROR)
            break;
        default:
            console.error('Invoice payment failed for an unknown reason.');

            updatedData = {
                            active: constant.SUBSCRIPTION_STATUS.INACTIVE,
                            cancelReason: constant.SUBSCRIPTION_CANCEL_REASON.UNKNOWN_ERROR
                          }
            await SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId: subscriptionId} , updatedData , option);
            await sendPaymentFailEmail(subscriptionId , constant.SUBSCRIPTION_CANCEL_REASON.UNKNOWN_ERROR)
            break;
    }
  } catch (error) {
    console.error("Error in webhook handler handleInvoicePaymentFailure():", error.message);
    let logs_data = {
                      api_name: 'subscription_webhook',
                      payload: JSON.stringify(req.body),
                      error_message: err.message,
                      error_response: JSON.stringify(err)
                    };
    const logEntry = new LOGS(logs_data);
    await logEntry.save();
}
}

const idealPaymentSubscription = async (req , invoice , paymentMethodType) => {

  try {

    

    const subscriptionId = invoice.subscription;
    // const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    const planId = invoice.lines.data[0]?.price?.product;
    const customerId = invoice?.customer;
    const planDetails = await PLANS_MODEL.findOne({planId: planId});
    const userDetails = await user_model.findOne({stripeCustomerId: customerId});
    const driverDetails = await driver_model.findOne({stripeCustomerId: customerId});

    const driveId = driverDetails && driverDetails._id ? driverDetails._id : null;
    const userId = userDetails && userDetails._id ? userDetails._id : null;

    let  detail = {};

    if (planDetails.name == `Pro` || planDetails.name ==  `Premium`) {
      
      detail.purchaseByCompanyId = userId; 
      detail.purchaseBy = userId; 
      detail.role = constant.ROLES.COMPANY;
    } else {
      detail.purchaseByDriverId = driveId; 
      detail.purchaseBy = driveId; 
      detail.role = constant.ROLES.DRIVER;
    }

    const subscriptionLine = await invoice.lines.data.find(line => line.type === 'subscription');
    // Convert UNIX timestamps to JavaScript Date objects
    const startPeriod = new Date(subscriptionLine.period.start * 1000); // Convert to milliseconds
    const endPeriod = new Date(subscriptionLine.period.end * 1000);

    let subscriptionData =  {
      subscriptionId: subscriptionId,
      planId: planId,
      productPriceId: invoice.lines.data[0]?.price?.id,
      customerId: customerId,
      ...detail,
      chargeId: invoice.charge,
      paymentIntentId: invoice.payment_intent,
      invoiceId: invoice.id,
      paid: constant.SUBSCRIPTION_PAYMENT_STATUS.PAID,
      active: constant.SUBSCRIPTION_STATUS.ACTIVE,
      invoicePdfUrl: invoice.invoice_pdf,
      invoiceUrl: invoice.hosted_invoice_url,
      billing_reason: invoice.billing_reason === `subscription_create` ? `subscription_create` : `subscription_cycle`,
      startPeriod: startPeriod,
      endPeriod: endPeriod,
      amount: invoice.lines.data[0]?.amount_excluding_tax / 100,
      invoiceName: invoice?.number
    }
    
    const newSubscription = new SUBSCRIPTION_MODEL(subscriptionData);
    await newSubscription.save();

    const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);
    const payymentMethodId = paymentIntent?.payment_method;

    if (payymentMethodId  && paymentMethodType === 'sepa_debit') {
      await stripe.paymentMethods.attach(payymentMethodId, { customer: customerId });

      // Update the default payment method for future invoices
      await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: payymentMethodId }
      });

      console.log('Payment method updated for future payments.');
    }
    return true;
    
   } catch (error) {
    console.error("Error in webhook handler idealPaymentSubscription ():", error.message);
    let logs_data = {
                      api_name: 'subscription_webhook ideal payment',
                      payload: JSON.stringify(req.body),
                      error_message: error.message,
                      error_response: JSON.stringify(error)
                    };
    const logEntry = new LOGS(logs_data);
    await logEntry.save();
}
}

module.exports = app;
