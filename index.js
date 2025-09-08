require("dotenv").config();
var createError = require("http-errors");
var express = require("express");
const bodyParser = require('body-parser');
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");
var cron = require("node-cron");
const db = require("./config/db");
const http = require("http");
const cors = require("cors");
const agency_model = require("./models/user/agency_model.js");
const LOGS = require("./models/user/logs_model"); // Import the Driver model
const SETTING_MODEL = require('./models/user/setting_model');
const CAR_TYPE_MODEL = require('./models/admin/car_type_model');
var apiRouter = require("./routes/index.js");
const { Server } = require("socket.io");
const { driverDetailsByToken,
        sendNotification, 
        sendPaymentFailEmail , 
        sendEmailSubscribeSubcription , 
        getPendingPayoutTripsBeforeWeek,
        transferToConnectedAccount,
        sendPayoutToBank,
        notifyInsufficientBalance,
        notifyPayoutPaid,
        notifyPayoutFailure,
        emitTripCancelledByDriver,
        emitTripRetrivedByCompany,
        emitTripAcceptedByDriver,
        generateInvoiceReceipt
      } = require("./Service/helperFuntion");
const {runPayoutsBatch} = require("./Service/payoutService");
const driver_model = require("./models/user/driver_model");
const trip_model = require("./models/user/trip_model.js");
const user_model = require("./models/user/user_model");
const SUBSCRIPTION_MODEL = require("./models/user/subscription_model");
const PLANS_MODEL = require("./models/admin/plan_model");
const { toConstantCase} = require('./utils/money');
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

const payoutWebhook = require('./routes/webhooks/payoutWebhook'); // exports a handler fn
app.post('/payout_webhook', bodyParser.raw({ type: 'application/json' }), payoutWebhook);

app.post( "/subscription_webhook", bodyParser.raw({type: 'application/json'}), async (req, res) => {

  console.log('webhook triggered----------------')
  const istTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });  
    try {
         
        const endpointSecret = process.env.STRIPE_TEST_WEBHOOK_ENDPOINT_SECRET;
          
          const sig = req.headers['stripe-signature'];
          let event;

          try {
            event = await stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            console.log("Webhook received successfully----" , event.type);
            // console.log("Webhook JSON.stringify----" , JSON.stringify(event));
          } catch (err) {
            console.log(`Webhook Error: ${err.message}`);

            let logs_data = { api_name: 'subscription_webhook', payload: JSON.stringify(req.body),
                              error_message: err.message, error_response: JSON.stringify(err)
                            };

            const logEntry = new LOGS(logs_data);
            logEntry.save();
            return res.status(200).send({ received: true , error_message: err.message , istTime:istTime});
          }

          // -------------------- Main Logic start
          console.log('event.type-------up' , event.type)
          let logs_data = { api_name: 'subscription_webhook', payload: event.type, error_message: `webhook`, error_response: JSON.stringify(event) };
          const logEntry = new LOGS(logs_data);
          logEntry.save();


          if (event.type === 'invoice.payment_succeeded') {
            let invoice = event.data.object;
            let updateData;

            if (invoice.billing_reason === "subscription_create") {

              // Extract relevant information
              let subscriptionId = invoice.subscription; // Subscription ID

              let subscriptionExist = await SUBSCRIPTION_MODEL.findOne({subscriptionId:subscriptionId , paid: constant.SUBSCRIPTION_PAYMENT_STATUS.UNPAID })
              

              let paymentIntentId = invoice.payment_intent;

              const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

              const paymentMethod = await stripe.paymentMethods.retrieve(paymentIntent.payment_method);

              if (paymentMethod.type === 'ideal' ||  paymentMethod.type === 'sepa_debit') {
                console.log('This subscription was created using iDEAL.' , paymentMethod.type);

                // Store this info in your database if needed
                await idealPaymentSubscription(req , invoice , paymentMethod.type);
              } else {

                updateData =  {
                  chargeId: invoice.charge,
                  paymentIntentId: invoice.payment_intent,
                  invoiceId: invoice.id,
                  paid: constant.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                  active: constant.SUBSCRIPTION_STATUS.ACTIVE,
                  invoicePdfUrl: invoice.invoice_pdf,
                  invoiceUrl: invoice.hosted_invoice_url,
                  billing_reason: `subscription_create`
                }

                const result = await SUBSCRIPTION_MODEL.updateOne(
                                                                      { _id: new mongoose.Types.ObjectId(subscriptionExist._id) }, // filter
                                                                      { $set: updateData } // update operation
                                                                  );

                let logs_data = {
                                  api_name: 'subscription_webhook',
                                  payload: event.type,
                                  error_message: `billing_reason - subscription_create`,
                                  error_response: JSON.stringify(event)
                                };

                const logEntry = new LOGS(logs_data);
                logEntry.save();

                // Send subscription email to user
                sendEmailSubscribeSubcription(subscriptionId);
              }

            } else if (invoice.billing_reason === "subscription_cycle") {

              // Extract relevant information
              const subscriptionId = invoice.subscription; // Subscription ID

              let subscriptionExist = await SUBSCRIPTION_MODEL.findOne({subscriptionId:subscriptionId})

              const subscriptionLine = await invoice.lines.data.find(line => line.type === 'subscription');
              // Convert UNIX timestamps to JavaScript Date objects
              const startPeriod = new Date(subscriptionLine.period.start * 1000); // Convert to milliseconds
              const endPeriod = new Date(subscriptionLine.period.end * 1000);

              
              let option = { new: true };

              // Set inactive to old entry related to this subscription ID because new Entry will start
              SUBSCRIPTION_MODEL.findOneAndUpdate({subscriptionId:subscriptionId} , {active: constant.SUBSCRIPTION_STATUS.INACTIVE} ,option);

              updateData =  {
                              subscriptionId:invoice.subscription,
                              planId: subscriptionExist?.planId,
                              productPriceId: subscriptionExist.priceId,
                              customerId: subscriptionExist.customerId,
                              role: subscriptionExist.role,
                              purchaseBy: subscriptionExist.purchaseBy,
                              amount: subscriptionExist.amount,
                              billing_reason: `subscription_cycle`,
                              startPeriod: startPeriod,
                              endPeriod: endPeriod,
                              chargeId: invoice.charge,
                              paymentIntentId: invoice.payment_intent,
                              invoiceId: invoice.id,
                              paid: constant.SUBSCRIPTION_PAYMENT_STATUS.PAID,
                              active: constant.SUBSCRIPTION_STATUS.ACTIVE,
                              invoicePdfUrl: invoice.invoice_pdf,
                              invoiceUrl: invoice.hosted_invoice_url,
                            };

              const subscriptionRenewal = new SUBSCRIPTION_MODEL(updateData);
              subscriptionRenewal.save();

              let logs_data = {
                api_name: 'subscription_webhook',
                payload: event.type,
                error_message: `billing_reason - subscription_cycle`,
                error_response: JSON.stringify(event)
              };
              const logEntry = new LOGS(logs_data);
              logEntry.save();

            } else if (invoice.billing_reason === "checkout" || invoice.billing_reason === "manual") {
              console.log("💳 This invoice is for a **One-Time Payment**");

              const checkoutSessions = await stripe.checkout.sessions.list({
                                                                            payment_intent: invoice.payment_intent, // Find session with this invoice
                                                                            limit: 1,
                                                                          });

              if (checkoutSessions.data.length > 0) {

                const checkoutSessionsId = checkoutSessions.data[0].id;
                console.log("🔗 This invoice belongs to Checkout Session:", checkoutSessionsId);

                const condition = { "stripe_payment.payment_intent_id": checkoutSessionsId };
                const invoiceUpdateData = { 
                                            $set: {
                                              hosted_invoice_url: invoice?.hosted_invoice_url,
                                              invoice_pdf: invoice?.invoice_pdf,
                                            } 
                                          };
                const option = { new: true } 
                //  Update invoice URL into our system
                const updatedTrip = await trip_model.findOneAndUpdate(
                                                                        condition, // Find condition
                                                                        invoiceUpdateData, 
                                                                        option // Returns the updated document
                                                                      );
                console.log('cheikng find update-----------')
                console.log('cheikng find update' , updatedTrip)
              } else {
                console.log("⚠️ No matching Checkout Session found.");
              }
            } else {
              console.log("⚠️ Unknown billing reason:", invoice.billing_reason);
            }


          } else if (event.type ===`invoice.payment_failed`) { // when Payment will be failed

            const invoice = event.data.object;

            let logs_data = {
              api_name: 'subscription_webhook',
              payload: JSON.stringify(event),
              error_message: `Retry payment`,
              error_response: JSON.stringify(event)
            };
            const logEntry = new LOGS(logs_data);
            logEntry.save();

            // Retry payment (optional)
            // const retryInvoice = await stripe.invoices.pay(invoice.id, {
            //   off_session: true, // Try charging without user interaction
            // });

            // if (retryInvoice.status === "paid") {
            //   console.log("Retried payment successful");
            //   let logs_data = {
            //     api_name: 'subscription_webhook',
            //     payload: JSON.stringify(event),
            //     error_message: `Retry payment`,
            //     error_response: JSON.stringify(event)
            //   };
            //   const logEntry = new LOGS(logs_data);
            //   await logEntry.save();
            // } else {

            //   console.log("Retry failed, sending email to user...");
            //   // Notify the user to update their payment method
            //   await handleInvoicePaymentFailure(invoice)
            // }

            handleInvoicePaymentFailure(invoice)

           
          } 

          
          // Log the webhook event
          console.log("Webhook received successfully");
          return res.status(200).send({ received: true  , message: `Webhook received successfully for subscription webhook`, istTime:istTime});
      } catch (error) {
          console.error(" subscription webhook:", error.message);
          let logs_data = {
                            api_name: 'subscription_webhook error',
                            payload: JSON.stringify(req.body),
                            error_message: error.message,
                            error_response: JSON.stringify(error)
                          };
          const logEntry = new LOGS(logs_data);
          logEntry.save();
          return res.status(200).send({ received: true , error_message: error.message , istTime:istTime});
      }
  }
);

// app.post( "/payout_webhook", bodyParser.raw({type: 'application/json'}), async (req, res) => {

//   console.log('webhook triggered payout_webhook----------------')
//   const istTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });  
//     try {
         
//         const endpointSecret = process.env.STRIPE_PAYOUT_SECRET;
          
//           const sig = req.headers['stripe-signature'];
//           let event;
         
//           try {
//             event = await stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
//             console.log("payout webhook received successfully----" , event.type);
            
//           } catch (err) {
//             console.log(`payout_webhook Error: ${err.message}`);


//             let logs_data = { 
//                               api_name: 'payout_webhook', payload: JSON.stringify(req.body),
//                               error_message: err.message, error_response: JSON.stringify(err)
//                             };

//             const logEntry = new LOGS(logs_data);
//             logEntry.save();
//             return res.status(200).send({ received: true , error_message: err.message , istTime:istTime});
//           }

//           // -------------------- Main Logic start
        
//           console.log('payout_webhook event-------up' , event)

//           const tripDetails = await trip_model.findOne({ 'payout.id': event?.data?.object?.id });

//           console.log('check id---------' , { 'payout.id': event?.data?.object?.id })
//           if (tripDetails) {

//             console.log('payout tripDetails------', tripDetails)

//             const userDetails = await user_model.findOne({ _id: tripDetails?.created_by_company_id });
//             if (event.type === 'payout.paid' ) {
//               const payout = event.data.object;
//               const isPaid = payout.status === 'paid';
//               // Handle successful payout here
//               // For example, update your database or notify the user
              
//               const updateTrip = await trip_model.findOneAndUpdate(
//                                                               { 'payout.id': payout?.id }, // Find by tripId
//                                                               { $set: { 
//                                                                         company_trip_payout_completed_date: payout. status == 'paid'?? new Date().toISOString(), 
//                                                                         'payout.status': constant.PAYOUT_TANSFER_STATUS[toConstantCase(payout.status)],
//                                                                         'payout.completed_date': isPaid ? new Date() : null,     // set only when paid
//                                                                         'payout.failure_code': payout.failure_code || null,
//                                                                         'payout.failure_message': payout.failure_message || null,
//                                                                         is_company_paid: true,
//                                                                         company_trip_payout_status: constant.PAYOUT_TANSFER_STATUS[toConstantCase(payout.status)]
//                                                                       } 
//                                                               }, // Update fields
//                                                               { new: true } // Return the updated document
//                                                             );

//               console.log('payout done------')
//               console.log('payout done------' ,updateTrip)
//               notifyPayoutPaid(userDetails , tripDetails , payout);
                                                          
//             } else if (event.type === 'payout.failed') {
  
//               const chek = await trip_model.findOneAndUpdate(
//                                                             { company_trip_payout_id: payout?.id }, // Find by tripId
//                                                             { $set: { 
//                                                                       company_trip_payout_status: constant.PAYOUT_TANSFER_STATUS.FAILED,
//                                                                       company_trip_payout_failure_code: payout.failure_code ,
//                                                                       company_trip_payout_failure_message: payout.failure_message,
//                                                                     } 
//                                                             }, // Update fields
//                                                             { new: true } // Return the updated document
//                                                           );

//               notifyPayoutFailure(userDetails , tripDetails , payout);
//               console.log('payout failed------')
//             }
//           } else {
//             console.log('trip not found based on this payout-------up' , event)
//             let logs_data = { api_name: 'payout_webhook', payload: JSON.stringify(req.body),
//                               error_message: `trip not found based on this payout`, error_response: JSON.stringify(event)
//                             };

//             const logEntry = new LOGS(logs_data);
//             logEntry.save();
//             return res.status(200).send({ received: true , error_message: `payout_webhook event not found` , istTime:istTime});
//           }

          
//           let logs_data = { api_name: 'payout_webhook', payload: event.type, error_message: `payout_webhook`, error_response: JSON.stringify(event) };
//           const logEntry = new LOGS(logs_data);
//           return res.status(200).send({ received: true  , message: `payout_webhook received successfully`, istTime:istTime});
//           logEntry.save();
//         } catch (error) {
//           console.error("Error in webhook handler payout_webhook():", error.message);
//           let logs_data = {
//                             api_name: 'payout_webhook error',
//                             payload: JSON.stringify(req.body),
//                             error_message: error.message,
//                             error_response: JSON.stringify(error)
//                           };
//           const logEntry = new LOGS(logs_data);
//           logEntry.save();
//           return res.status(200).send({ received: true , error_message: error.message , istTime:istTime});
//       }
//     }
//   )
      
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
  console.log*('turning----')
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
    
    await  runPayoutsBatch()
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
      
        if (driverBySocketId.email == 'nirmla@yopmail.com') {

          console.log('current lat long----------------------' , latitude , longitude , '----------------------' , driverBySocketId.email)
        }
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

async function checkTripsAndSendNotifications() {
  try {
    const currentDate = new Date();
    // const fifteenMinutesBefore = new Date(currentDate.getTime() + 15 * 60000); // Add 15 minutes in milliseconds  console.log("🚀 ~ checkTripsAndSendNotifications ~ fifteenMinutesBefore:", fifteenMinutesBefore)
    // const thirteenMinutesBefore = new Date(currentDate.getTime() + 13 * 60000);

    let fifteenMinutesBefore = new Date(currentDate.getTime() + 15 * 60000); // Add 15 minutes in milliseconds  console.log("🚀 ~ checkTripsAndSendNotifications ~ fifteenMinutesBefore:", fifteenMinutesBefore)
    let thirteenMinutesBefore = new Date(currentDate.getTime() + 13 * 60000);

    const { startDateTime, endDateTime  , currentDateTime} = await get20thMinuteRangeUTC();
    // fifteenMinutesBefore = new Date(endDateTime);
    // thirteenMinutesBefore = new Date(startDateTime);

    const trips = await trip_model.find({
                                          pickup_date_time: {$gte: (startDateTime), $lte: endDateTime },
                                          // pickup_date_time: { $gte: thirteenMinutesBefore },
                                          fifteenMinuteNotification: false,
                                          driver_name: { $ne: null }
                                        })
                                        .populate([
                                                    { path: "driver_name" }, 
                                                    { path: "created_by_company_id" }
                                                  ]);

    const notifications = [];
    const ids = [];

    for(let trip of trips) {
      let companyAgecnyData = await agency_model.findOne({user_id: trip?.created_by_company_id});
      
      // send to trip's driver app
      if (trip?.driver_name?.deviceToken) {
          
        let targetLocale = trip?.driver_name?.app_locale || process.env.DEFAULT_LANGUAGE;
        let driverNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});

        let driverNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
        sendNotification( trip?.driver_name?.deviceToken, driverNotificationMessage, driverNotificationTitle, trip )
      }

      // send to trip's driver web
      if (trip?.driver_name?.webDeviceToken) {
          
        let targetLocale = trip?.driver_name?.web_locale || process.env.DEFAULT_LANGUAGE;
        let driverNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});

        let driverNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});
        sendNotification( trip?.driver_name?.webDeviceToken, driverNotificationMessage, driverNotificationTitle, trip )
      }

      // send to trip's company app
      if (trip.created_by_company_id?.deviceToken) {
        
        let targetLocale = trip?.created_by_company_id?.app_locale || process.env.DEFAULT_LANGUAGE;
        let companyNotificationMessage = i18n.__({ phrase: "editTrip.notification.companyPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});

        let companyNotificationTitle = i18n.__({ phrase: "editTrip.notification.companyPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});

        sendNotification( trip.created_by_company_id?.deviceToken, companyNotificationMessage, companyNotificationTitle, trip )
      }

      // send to trip's company web
      if (trip.created_by_company_id?.webDeviceToken) {
        
        let targetLocale = trip?.created_by_company_id?.web_locale || process.env.DEFAULT_LANGUAGE;
        let companyNotificationMessage = i18n.__({ phrase: "editTrip.notification.companyPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});

        let companyNotificationTitle = i18n.__({ phrase: "editTrip.notification.companyPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes`});

        sendNotification( trip.created_by_company_id?.webDeviceToken, companyNotificationMessage, companyNotificationTitle, trip )
      }

      // functionality for the drivers who have account access as partner
      const driverHasCompanyPartnerAccess = await driver_model.find({
                                                                      parnter_account_access  : {
                                                                                                  $elemMatch: { company_id: new mongoose.Types.ObjectId(trip?.created_by_company_id) },
                                                                                                },
                                                                    });
      
      if (driverHasCompanyPartnerAccess){

        for (let partnerAccount of driverHasCompanyPartnerAccess) {
          if (partnerAccount?.deviceToken) {

            let targetLocale = partnerAccount?.app_locale || process.env.DEFAULT_LANGUAGE;
            let driverPartnerAccountNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPartnerAccountPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});

            let driverPartnerAccountNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPartnerAccountPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
        
            await sendNotification( partnerAccount?.deviceToken, driverPartnerAccountNotificationMessage, driverPartnerAccountNotificationTitle, trip )
          }

          if (partnerAccount?.webDeviceToken) {

            let targetLocale = partnerAccount?.web_locale || process.env.DEFAULT_LANGUAGE;
            let driverPartnerAccountNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverPartnerAccountPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});

            let driverPartnerAccountNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverPartnerAccountPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
        
            await sendNotification( partnerAccount?.webDeviceToken, driverPartnerAccountNotificationMessage, driverPartnerAccountNotificationTitle, trip )
          }
        }
      }

      // functionality for the drivers who have account access as partner
      const driverHasCompanyAccess = await driver_model.find({
                                                              company_account_access  : {
                                                                                          $elemMatch: { company_id: new mongoose.Types.ObjectId(trip?.created_by_company_id) },
                                                                                        },
                                                            });

      if (driverHasCompanyAccess){

        for (let accountAccess of driverHasCompanyAccess) {
          if (accountAccess?.deviceToken) {

            
            let targetLocale = accountAccess?.app_locale || process.env.DEFAULT_LANGUAGE;
            let driverCompanyAccountNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverCompanyAccountPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});

            let driverCompanyAccountNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverCompanyAccountPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
            await sendNotification( accountAccess?.deviceToken, driverCompanyAccountNotificationMessage, driverCompanyAccountNotificationTitle, trip )
          }

          if (accountAccess?.webDeviceToken) {

            
            let targetLocale = accountAccess?.web_locale || process.env.DEFAULT_LANGUAGE;
            let driverCompanyAccountNotificationMessage = i18n.__({ phrase: "editTrip.notification.driverCompanyAccountPreNotificationMessage", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});

            let driverCompanyAccountNotificationTitle = i18n.__({ phrase: "editTrip.notification.driverCompanyAccountPreNotificationTitle", locale: targetLocale }, { trip_id: trip.trip_id  , time: `20 minutes` , company_name: companyAgecnyData.company_name});
            await sendNotification( accountAccess?.webDeviceToken, driverCompanyAccountNotificationMessage, driverCompanyAccountNotificationTitle, trip )
          }
        }
      }

    }

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

const get20thMinuteRangeUTC = async () => {

  const adminPrepreNotificationTime = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.PRE_NOTIFICATION_TIME});

  const preNotificationTime = parseInt(parseFloat(adminPrepreNotificationTime.value))
  let currentTime = new Date();

  let currentDateTime = new Date();
  
  currentDateTime.setUTCHours(currentDateTime.getUTCHours());
  currentDateTime.setUTCMinutes(currentDateTime.getUTCMinutes());

  currentDateTime = currentDateTime.toISOString();
  // Add 15 minutes to the current time
  let futureTime = new Date(currentTime.getTime() + preNotificationTime * 60 * 1000);
  // console.log(currentDateTime)
  // console.log(futureTime)
  
  // Set the start time at the 15th minute in UTC with 0 seconds and 0 milliseconds
  let startDateTime = new Date(futureTime);
  startDateTime.setUTCHours(futureTime.getUTCHours());
  startDateTime.setUTCMinutes(futureTime.getUTCMinutes());
  startDateTime.setUTCSeconds(0); // Start at the 0th second
  startDateTime.setUTCMilliseconds(0); // Start at the 0th millisecond

  startDateTime = startDateTime.toISOString();

  // Set the end time at the 15th minute in UTC with 59 seconds and 999 milliseconds
  let endDateTime = new Date(futureTime);
  endDateTime.setUTCHours(futureTime.getUTCHours());
  endDateTime.setUTCMinutes(futureTime.getUTCMinutes());
  endDateTime.setUTCSeconds(59); // End at the 59th second
  endDateTime.setUTCMilliseconds(999); // End at the 999th millisecond
                      
  endDateTime = endDateTime.toISOString();
  
  return { startDateTime, endDateTime , currentDateTime};
};


// Schedule the task using cron for every minute
cron.schedule("* * * * *", () => {
  // console.log("hitting per minute-------")
  // console.log('running evry minute' , new Date())

  // Send push notification to driver and company when trip will start in 20 minutes
  // checkTripsAndSendNotifications();
  // initiateWeeklyCompanyPayouts();
  // logoutDriverAfterThreeHour()
});

const initiateWeeklyCompanyPayouts = async (res) => {
  try {

   
    // console.log('initiateWeeklyCompanyPayouts-----')
    const balance = await stripe.balance.retrieve();
    let availableBalance = balance?.available[0]?.amount || 0;
    const tripList = await getPendingPayoutTripsBeforeWeek();
    
// console.log('tripList---------' , tripList)
    if (availableBalance > 100) {
       
        // const connectedAccountId = `acct_1QxRoi4CiWWLkHIH`;
        // const tripId = `T-1051`
        // const payoutList = await checkPayouts(connectedAccountId);
        
        if (tripList.length > 0) {
          // console.log('paybale trip------')
          for (let  trip of tripList) {
            
            let amount = trip.companyPaymentAmount + trip?.child_seat_price + trip?.payment_method_price;

            if (amount < 1) { // atleast one euro will  be to send to the bank
              continue
            }
            let connectedAccountId = trip?.companyDetails?.connectedAccountId;
            let stripeCustomerId = trip?.companyDetails?.stripeCustomerId;
            let tripId = trip?.trip_id;

            let stripBalance = await stripe.balance.retrieve();
            let availableBalance = stripBalance?.available[0]?.amount || 0;
            
            // console.log('no balalnce' , availableBalance ,  Math.round(amount * 100))
            if (availableBalance >=  Math.round(amount * 100) ) {
              // amount = 5;

              // a) TRANSFER
              const transfer = await transferToConnectedAccount(amount, connectedAccountId , tripId);
              
              const updateTrip = await trip_model.findOneAndUpdate(
                                                              { _id: trip?._id }, // Find by tripId
                                                              { $set:   {
                                                                          'transfer.id': transfer.id ?? null,                                  // tr_...
                                                                          'transfer.amount': typeof transfer.amount === 'number' ? transfer.amount : null, // cents
                                                                          'transfer.currency': transfer.currency ?? null,
                                                                          'transfer.destination': transfer.destination ?? null,                 // acct_...
                                                                          'transfer.transfer_group': transfer.transfer_group ?? null,           // e.g., tripId
                                                                          'transfer.balance_transaction': transfer.balance_transaction ?? null, // txn_...
                                                                          'transfer.created': createdDate,                                      // Date
                                                                          'transfer.destination_payment': transfer.destination_payment ?? null, // optional
                                                                          'transfer.reversals': reversals,                                      // array of ids (or empty)
                                                                        } 
                                                                    }, // Update fields
                                                              { new: true } // Return the updated document
                                                            );

              console.log('transfer----' , {
                                                                          'transfer.id': transfer.id ?? null,                                  // tr_...
                                                                          'transfer.amount': typeof transfer.amount === 'number' ? transfer.amount : null, // cents
                                                                          'transfer.currency': transfer.currency ?? null,
                                                                          'transfer.destination': transfer.destination ?? null,                 // acct_...
                                                                          'transfer.transfer_group': transfer.transfer_group ?? null,           // e.g., tripId
                                                                          'transfer.balance_transaction': transfer.balance_transaction ?? null, // txn_...
                                                                          'transfer.created': createdDate,                                      // Date
                                                                          'transfer.destination_payment': transfer.destination_payment ?? null, // optional
                                                                          'transfer.reversals': reversals,                                      // array of ids (or empty)
                                                                        })
              const isInvoiceForCompany = true;
              const payoutDetails = await sendPayoutToBank(amount, connectedAccountId);
              const invoiceDetail = await generateInvoiceReceipt(stripeCustomerId , trip , isInvoiceForCompany)
              await trip_model.findOneAndUpdate(
                                                  { _id: trip?._id }, // Find by tripId
                                                  { 
                                                    $set: {  
                                                            company_hosted_invoice_url : invoiceDetail?.hosted_invoice_url,
                                                            company_invoice_pdf : invoiceDetail?.invoice_pdf,
                                                            company_trip_payout_id: payoutDetails?.id,
                                                            company_trip_payout_status: constant.PAYOUT_TANSFER_STATUS.PENDING,
                                                            company_trip_payout_initiated_date: new Date().toISOString(),
                                                          } 
                                                  }, 
                                                  { new: true } // Return the updated document
                                                );

              console.log('constant.PAYOUT_TANSFER_STATUS.PENDING------', constant.PAYOUT_TANSFER_STATUS.PENDING ,tripId)
            } else {

              console.log(`You dont have enough payment in your account to transfer the payment to the compmies.`)
              await notifyInsufficientBalance()
              break;
            }
          }
        }
        
        
    } else {
      await notifyInsufficientBalance()
      console.log(`You dont have enough payment in your account.`)
    }

    // console.log({
    //     code: 200,
    //     message: "weekly-company-payment",
    //     // tripList:tripList,
    //     balance,
    //     tripList
    //   });
    
  } catch (error) {
    console.error("Error initiateweeklyCompanyPayouts:", error);
    console.log({
                        code: constant.error_code,
                        message: error.message,
                    });
  }
}

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
