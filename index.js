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
var apiRouter = require("./routes/index.js");
const { Server } = require("socket.io");
const { driverDetailsByToken, 
        userDetailsByToken, 
        sendNotification, 
        sendPaymentFailEmail , 
        sendEmailSubscribeSubcription , 
        getPendingPayoutTripsBeforeWeek,
        transferToConnectedAccount,
        sendPayoutToBank,
        notifyInsufficientBalance,
        checkPayouts
      } = require("./Service/helperFuntion");
const driver_model = require("./models/user/driver_model");
const trip_model = require("./models/user/trip_model.js");
const user_model = require("./models/user/user_model");
const SUBSCRIPTION_MODEL = require("./models/user/subscription_model");
const SETTING_MODEL = require("./models/user/setting_model");
const PLANS_MODEL = require("./models/admin/plan_model");
const mongoose = require("mongoose");
var app = express();
app.use(cors());
const jwt = require("jsonwebtoken");
const constant = require("./config/constant.js");
const httpServer = http.createServer(app);
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// view engine setup

// Apply raw body parser specifically for Stripe webhook
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
            const invoice = event.data.object;
            let updateData;

            if (invoice.billing_reason === "subscription_create") {

              // Extract relevant information
              const subscriptionId = invoice.subscription; // Subscription ID

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
                              planId: subscriptionExist.planId,
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

app.post( "/payout_webhook", bodyParser.raw({type: 'application/json'}), async (req, res) => {

  console.log('webhook triggered payout_webhook----------------')
  const istTime = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });  
    try {
         
        const endpointSecret = process.env.STRIPE_PAYOUT_SECRET;
          
          const sig = req.headers['stripe-signature'];
          let event;
          console.log('endpointSecret--------' , endpointSecret);


          try {
            event = await stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
            console.log("payout webhook received successfully----" , event.type);
            
          } catch (err) {
            console.log(`payout_webhook Error: ${err.message}`);

            let logs_data = { 
                              api_name: 'payout_webhook', payload: JSON.stringify(req.body),
                              error_message: err.message, error_response: JSON.stringify(err)
                            };

            const logEntry = new LOGS(logs_data);
            logEntry.save();
            return res.status(200).send({ received: true , error_message: err.message , istTime:istTime});
          }

          // -------------------- Main Logic start
          console.log('payout_webhook event.type-------up' , event.type)
          console.log('payout_webhook event-------up' , event)
          let logs_data = { api_name: 'payout_webhook', payload: event.type, error_message: `payout_webhook`, error_response: JSON.stringify(event) };
          const logEntry = new LOGS(logs_data);
          return res.status(200).send({ received: true  , message: `payout_webhook received successfully`, istTime:istTime});
          logEntry.save();
        } catch (error) {
          console.error("Error in webhook handler payout_webhook():", error.message);
          let logs_data = {
                            api_name: 'payout_webhook error',
                            payload: JSON.stringify(req.body),
                            error_message: error.message,
                            error_response: JSON.stringify(error)
                          };
          const logEntry = new LOGS(logs_data);
          logEntry.save();
          return res.status(200).send({ received: true , error_message: error.message , istTime:istTime});
      }
    }
  )
      


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


app.get( "/weekly-company-payment", async (req, res) => {

  try {
   
    const balance = await stripe.balance.retrieve();
    let availableBalance = balance?.available[0]?.amount || 0;
    const tripList = await getPendingPayoutTripsBeforeWeek();
    // return res.send({
    //   code: 200,
    //   message: "weekly-company-payment",
    //   // tripList:tripList,
    //   balance,
    //   tripList
    // });

    if (availableBalance > 100) {
       
        // const connectedAccountId = `acct_1QxRoi4CiWWLkHIH`;
        // const tripId = `T-1051`
        // const payoutList = await checkPayouts(connectedAccountId);
        
        if (tripList.length > 0) {

          for (let  trip of tripList) {

            let amount = trip.companyPaymentAmount;
            let connectedAccountId = trip?.companyDetails?.connectedAccountId;
            let tripId = trip?.trip_id;

            let stripBalance = await stripe.balance.retrieve();
            let availableBalance = stripBalance?.available[0]?.amount || 0;
            
            console.log('no balalnce' , availableBalance ,  Math.round(amount * 100))
            if (availableBalance >=  Math.round(amount * 100) ) {
              amount = 5;
              const transferDedtails = await transferToConnectedAccount(amount, connectedAccountId , tripId);
              
              await trip_model.findOneAndUpdate(
                                                { _id: trip?._id }, // Find by tripId
                                                { $set: { company_trip_transfer_id: transferDedtails?.id } }, // Update fields
                                                { new: true } // Return the updated document
                                              );
              const payoutDetails = await sendPayoutToBank(amount, connectedAccountId);
              await trip_model.findOneAndUpdate(
                { _id: trip?._id }, // Find by tripId
                { 
                  $set: { 
                          company_trip_payout_id: payoutDetails?.id,
                          company_trip_payout_status: constant.PAYOUT_TANSFER_STATUS.PENDING
                        } 
                }, 
                { new: true } // Return the updated document
              );

              console.log('trip completed------' ,tripId)
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

    return res.send({
        code: 200,
        message: "weekly-company-payment",
        // tripList:tripList,
        balance,
        tripList
      });
    return res.send({
                      code: 200,
                      message: "weekly-company-payment",
                      tripList:tripList,
                      balance
                    });
  } catch (error) {
    console.error("Error retrieving balance:", error);
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

          driver.isWebSocketConnected = true;
          driver.webSocketId = socketId;
          await driver.save();

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

          user.isWebSocketConnected = true;
          user.webSocketId = socketId;
          await user.save();

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

          driver.isSocketConnected = true;
          driver.socketId = socketId;
          await driver.save();

          io.to(socketId).emit("userConnection",  {
                                                    code: 200,
                                                    message: "connected successfully with user id: " + id,
                                                  }
                              );
        }
        
        
      } else { // when company accessing his account

        const user = await user_model.findOne({ _id: id });

        if (user) {

          user.isSocketConnected = true;
          user.socketId = socketId;
          await user.save();

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
      console.log("🚀 ~ socket.on ~ err: addUser", err);
    }
  });

  socket.on("companyCancelledTrip", async ({ driverId, trip }) => {
    try {
      const trip_details = await trip_model.findById(trip.result?._id);

      if (trip_details) {
        trip_details.driver_name = null;
        await trip_details.save(); // Save the updated trip details
      }
      
      const userData = await user_model.findOne({ _id: trip_details?.created_by_company_id, });
      const company_data = await agency_model.findOne({ user_id: trip_details?.created_by_company_id, });

      const driverById = await driver_model.findOne({ _id: driverId, });

      if (driverById?.socketId) {

        io.to(driverById.socketId).emit("retrivedTrip", {
                                                                message: `Your trip has been retrived by company, ${company_data?.company_name}`,
                                                                trip: trip,
                                                              }
                                              );

        io.to(driverById?.socketId).emit("refreshTrip", { message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates", } )
      }

      if (driverById?.webSocketId) {

        io.to(driverById?.webSocketId).emit(
                                                    "retrivedTrip",
                                                    {
                                                      message: `Your trip has been retrived by company, ${company_data?.company_name}`,
                                                    },
                                                  );
      }

      if (driverById?.deviceToken) {
        const response = sendNotification(
                                                  driverById?.deviceToken,
                                                  `Your trip ( ${ trip_details.trip_id } ) has been retrived by company, ${company_data?.company_name}`,
                                                  `Trip Retrieved by Company ( ${company_data?.company_name} )`,
                                                  trip
                                                );
      }

      // for the company
      if (userData?.socketId) {

        // for refresh trip
        io.to(userData?.socketId).emit("refreshTrip", { message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates", } )
      }

      // functionality for the drivers who have account access as partner

      const driverHasCompanyPartnerAccess = await driver_model.find({ parnter_account_access  : {
                                                                                                  $elemMatch: { company_id: new mongoose.Types.ObjectId(trip_details?.created_by_company_id) },
                                                                                                },
                                                                    });

      if (driverHasCompanyPartnerAccess){

        for (let partnerAccount of driverHasCompanyPartnerAccess) {
          
          // for partner app side
          if (partnerAccount?.socketId) {

            // for refresh trip
            io.to(partnerAccount?.socketId).emit("refreshTrip", { message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates", } )
          }

          if (partnerAccount?.webSocketId) {

            // for refresh trip
            io.to(partnerAccount?.webSocketId).emit("refreshTrip", { message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates", } )
          }

          if (partnerAccount?.deviceToken) {
            sendNotification(
                                    partnerAccount?.deviceToken,
                                    `The trip ( ${ trip_details.trip_id } ) has been retrived by company, ${company_data?.company_name}`,
                                    `Trip retrieved (Partner Account Access:- ${company_data?.company_name})`,
                                    trip
                                  );
          }
        }
      }

      // For the driver who has company access
        
      const driverHasCompanyAccess = await driver_model.find({
                                                                company_account_access  : {
                                                                                              $elemMatch: { company_id: new mongoose.Types.ObjectId(trip_details?.created_by_company_id) },
                                                                                            },
                                                              });

      if (driverHasCompanyAccess){

        for (let driverCompanyAccess of driverHasCompanyAccess) {
          if (driverCompanyAccess?.socketId) {

            // for refresh trip
            io.to(driverCompanyAccess?.socketId).emit("refreshTrip", { message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates", } )
          }

          if (driverCompanyAccess?.webSocketId) {

            // for refresh trip
            io.to(driverCompanyAccess?.webSocketId).emit("refreshTrip", { message: "The trip has been revoked from the driver by the company. Please refresh the data to view the latest updates", } )
          }

          if (driverCompanyAccess?.deviceToken) {
            sendNotification(
              driverCompanyAccess?.deviceToken,
                                    `The trip ( ${ trip_details.trip_id } ) has been retrived by company, ${company_data?.company_name}`,
                                    `Trip retrieved (Company Account Access:- ${company_data?.company_name})`,
                                    trip
                                  );
          }
        }
      }
    } catch (err) {
      console.log("🚀 ~ socket.on companyCancelledTrip ~ err:", err);
    }
  });

  socket.on("updateDriverLocation", async ({ longitude, latitude }) => {
    try {

      const driverBySocketId = await driver_model.findOne({ socketId: socket.id, });
      // console.log('--------------------------------------------------',socket.id)
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

        console.log('----------------------------------------')
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
            const companyAgencyData = await agency_model.findOne({user_id: trip.created_by_company_id})
            let driver_name = driverBySocketId.first_name + " " + driverBySocketId.last_name;

            if (user.role == "COMPANY") {
              if (user?.socketId) {
                // socket for app
                io.to(user?.socketId).emit("tripCancelledBYDriver", {
                                                                      trip,
                                                                      driver: driverBySocketId,
                                                                      message: `Trip canceled by the driver ${driver_name}`,
                                                                    }
                                          );

                // for refresh trip
                io.to(user?.socketId).emit("refreshTrip",
                                                  {
                                                    message:
                                                      "Trip Driver didn't accpet the trip. Please refresh the data",
                                                  }
                                                );
              }

              if (user?.webSocketId) {

                // socket for web
                io.to(user?.webSocketId).emit(
                                                      "tripCancelledBYDriver",
                                                      {
                                                        trip,
                                                        driver: driverBySocketId,
                                                        message: `Trip canceled by the driver ${driver_name}`,
                                                      },
                                                     );

                // for refresh trip
                io.to(user?.webSocketId).emit(
                                                      "refreshTrip",
                                                      {
                                                        message:
                                                          "The trip driver did not accept the trip. Please refresh the data to see the latest updates",
                                                      },
                                                    );
              }

              if (user?.deviceToken) {
                sendNotification(
                                        user?.deviceToken,
                                        `The trip has been canceled by driver ( ${driver_name} ) and trip ID is ${trip.trip_id}`,
                                        `Trip Canceled by Driver`,
                                        driverBySocketId
                                      );
              }

           

              // functionality For assigned driver by company

              // For the driver who has company access
        
              const driverHasCompanyAccess = await driver_model.find({
                                                                        _id: { $ne: trip.driver_name}, //Notifications and pop-ups will exclude the driver currently assigned to the ride.
                                                                        company_account_access  : {
                                                                                                    $elemMatch: { company_id: new mongoose.Types.ObjectId(trip.created_by_company_id) },
                                                                                                  },
                                                                    });

              if (driverHasCompanyAccess){

                for (let driverCompanyAccess of driverHasCompanyAccess) {
                  
                  if (driverCompanyAccess?.socketId) {

                    io.to(driverCompanyAccess?.socketId).emit(
                                                                      "tripCancelledBYDriver",
                                                                      {
                                                                        trip,
                                                                        driver: driverBySocketId,
                                                                        message: `Trip canceled by the driver ${driver_name}`,
                                                                      },
                                                                    );
                  }

                  if (driverCompanyAccess?.webSocketId) {

                    io.to(driverCompanyAccess?.webSocketId).emit(
                                                                        "tripCancelledBYDriver",
                                                                        {
                                                                          trip,
                                                                          driver: driverBySocketId,
                                                                          message: `Trip canceled by the driver ${driver_name}`,
                                                                        },
                                                                      );
                  }

                  if (driverCompanyAccess?.deviceToken) {

                    sendNotification(
                                            driverCompanyAccess?.deviceToken,
                                            `The trip has been canceled by driver ( ${driver_name} ) and trip ID is ${trip.trip_id}`,
                                            `Trip canceled ( Company Access:- ${companyAgencyData.company_name} )`,
                                            driverBySocketId
                                          );
                  }
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
                    io.to(partnerAccount?.socketId).emit("tripCancelledBYDriver", {
                                                                                          trip,
                                                                                          driver: driverBySocketId,
                                                                                          message: "Trip canceled successfully",
                                                                                        }
                                                              );
                      
                    // for refresh trip
                   io.to(partnerAccount?.socketId).emit(
                                                                "refreshTrip",
                                                                {
                                                                  message:
                                                                    "The trip driver did not accept the trip. Please refresh the data to receive the latest updates.",
                                                                }
                                                              );
                  }
        
                  // for partner Web side
                  if (partnerAccount?.webSocketId) {
        
                  io.to(partnerAccount?.webSocketId).emit("tripCancelledBYDriver", {
                                                                                        trip,
                                                                                        driver: driverBySocketId,
                                                                                        message: `Trip canceled by the driver ${driver_name}`,
                                                                                      }
                                                            );
        
                  io.to(partnerAccount?.webSocketId).emit("refreshTrip",  {
                                                                                  message:
                                                                                    "Trip Driver didn't accpet the trip. Please refresh the data",
                                                                                }
                                                                );
                  }
        
                  // If driver has device token to send the notification otherwise we can get device token his company account if has has company role
                  if (partnerAccount?.deviceToken) {
                    // notification for driver
        
                    sendNotification(
                                            partnerAccount?.deviceToken,
                                            `The trip has been canceled by driver ( ${driver_name} ) and trip ID is ${trip.trip_id}`,
                                            `Trip Cancelled ( Partner Account Access:- ${companyAgencyData.company_name})`,
                                            driverBySocketId
                                          );
                  } else if (partnerAccount.isCompany){
        
                    const companyData = await user_model.findById(partnerAccount.driver_company_id);
                    if (companyData?.deviceToken) {
                      // notification for company
        
                      sendNotification(
                                              companyData?.deviceToken,
                                              `The trip has been canceled by driver ( ${driver_name} ) and trip ID is ${trip.trip_id}`,
                                              `Trip Cancelled ( Partner Account Access:- ${companyAgencyData.company_name})`,
                                              driverBySocketId
                                            );
                    }
                  }
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
        console.log("🚀 ~ socket.on cancelDriverTrip ~ error:", error);
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

        // for refresh trip to driver who accepted the trip
        await io.to(socket.id).emit("refreshTrip", { message: "You have accepted the trip. Please refresh the data to view the updates", } )

        let user = await user_model.findById(trip.created_by_company_id);
        const companyAgencyData = await agency_model.findOne({user_id: trip.created_by_company_id})
        let driver_name = driverBySocketId.first_name + " " + driverBySocketId.last_name;

        if (user.role == "COMPANY") {

          if (user?.socketId) {
            
            io.to(user?.socketId).emit("tripAcceptedBYDriver",
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
            io.to(user?.socketId).emit("refreshTrip", {
                                                              message:
                                                                "The trip driver has accepted the trip. Please refresh the data to view the latest updates",
                                                            }
                                            )
          }
          
          if (user?.deviceToken) {
            
            sendNotification(
                                    user?.deviceToken, 
                                    `The trip has been accepted by the driver ( ${driver_name} ). Trip ID: ${trip.trip_id}`,  
                                    `Trip Accepted`, 
                                    driverBySocketId
                                  );
          }

          //  Functionality for the assigned driver by company

          // For the driver who has company access
          
            const driverHasCompanyAccess = await driver_model.find({
                                                                      _id: { $ne: trip.driver_name}, //Notifications and pop-ups will exclude the driver currently assigned to the ride.
                                                                      company_account_access  : {
                                                                                                  $elemMatch: { company_id: new mongoose.Types.ObjectId(trip.created_by_company_id) },
                                                                                                },
                                                                  });

            if (driverHasCompanyAccess){

              for (let driverCompanyAccess of driverHasCompanyAccess) {
                
                if (driverCompanyAccess?.socketId) {

                  io.to(driverCompanyAccess?.socketId).emit("tripAcceptedBYDriver",
                                                                  {
                                                                    trip,
                                                                    driver: driverBySocketId,
                                                                    message: "Trip accepted successfully",
                                                                  }
                                                                );
                }

                if (driverCompanyAccess?.webSocketId) {

                  io.to(driverCompanyAccess?.webSocketId).emit("tripAcceptedBYDriver",
                                                                      {
                                                                        trip,
                                                                        driver: driverBySocketId,
                                                                        message: "Trip accepted successfully",
                                                                      }
                                                                    );
                }

                if (driverCompanyAccess?.deviceToken) {

                  sendNotification(
                                          driverCompanyAccess?.deviceToken,
                                          `Trip accepted by the driver ( ${driver_name}) and trip ID is ${trip.trip_id}`,
                                          `Trip Accepted (Company Access:- ${companyAgencyData.company_name})`,
                                          driverBySocketId
                                        );
                }
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

                
                io.to(partnerAccount?.socketId).emit("tripAcceptedBYDriver",  {
                                                                                      trip,
                                                                                      message: "Trip accepted successfully",
                                                                                    },
                                                          );

                // for refresh trip
                io.to(partnerAccount?.socketId).emit("refreshTrip", { message: "Trip Driver didn't accpet the trip. Please refresh the data", } )
              }
    
              // for partner Web side
              if (partnerAccount?.webSocketId) {
    
                io.to(partnerAccount?.webSocketId).emit("tripAcceptedBYDriver", {
                                                                                        trip,
                                                                                        message: "Trip accepted successfully",
                                                                                      }
                                                              );
    
              }
              
           
              // If driver has device token to send the notification otherwise we can get device token his company account if has has company role
              if (partnerAccount?.deviceToken) {
                // notification for driver
                
                sendNotification(
                                        partnerAccount?.deviceToken,
                                        `Trip accepted by the driver ( ${driver_name}) and trip ID is ${trip.trip_id}`,
                                        `Trip Accepted (Company access:- ${companyAgencyData.company_name})`,
                                        driverBySocketId
                                      );
              } else if (partnerAccount.isCompany){
    
                const companyData = await user_model.findById(partnerAccount.driver_company_id);
                if (companyData?.deviceToken) {
                  // notification for company
    
                  sendNotification(
                                          companyData?.deviceToken,
                                          `Trip accepted by driver ${driver_name} and trip ID is ${trip.trip_id}`,
                                          `Trip Accepted (Partner Account Access:- ${companyAgencyData.company_name})`,
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
    
    // console.log('currentDateTime----' , currentDateTime)
    // console.log('thirteenMinutesBefore----' , thirteenMinutesBefore)
    // console.log('fifteenMinutesBefore----' , fifteenMinutesBefore)                                
    // console.log('trip-----' , trips)

    const notifications = [];
    const ids = [];

    for(let trip of trips) {
      let companyAgecnyData = await agency_model.findOne({user_id: trip?.created_by_company_id});
      const driverNotificationMessage = `Your trip with ID ${trip.trip_id} is scheduled to begin in 20 minutes. Kindly prepare accordingly.`;
      const driverNotificationTitleMessage = `Driver Upcoming Trip ID (${trip.trip_id}): 20 Minutes to Start`;
      const companyNotificationMessage = `Your trip with ID ${trip.trip_id} is about to start in 20 minutes.`;
      const companyNotificationTitleMessage = `Company Upcoming Trip ID (${trip.trip_id}): 20 Minutes to Start`;
      const driverPartnerAccountNotificationMessage = `Your (partner account - ${companyAgecnyData.company_name}) trip with ID ${trip.trip_id} is about to start in 20 minutes.`;
      const driverPartnerAccountNotificationTitleMessage = `Company (partner account - ${companyAgecnyData.company_name}) Upcoming Trip ID (${trip.trip_id}): 20 Minutes to Start`;
      const driverCompanyAccountNotificationMessage = `Your (company access - ${companyAgecnyData.company_name}) trip with ID ${trip.trip_id} is about to start in 20 minutes.`;
      const driverCompanyAccountNotificationTitleMessage = `Company (company access - ${companyAgecnyData.company_name}) Upcoming Trip ID (${trip.trip_id}): 20 Minutes to Start`;
      
      console.log('this trip is eligible for 20 minute notification -----------' , trip)
      // send to trip's driver
      if (trip?.driver_name?.deviceToken) {
          
          sendNotification( trip?.driver_name?.deviceToken, driverNotificationMessage, driverNotificationTitleMessage, trip )
      }

      // send to trip's company
      if (trip.created_by_company_id?.deviceToken) {
        
        sendNotification( trip.created_by_company_id?.deviceToken, companyNotificationMessage, companyNotificationTitleMessage, trip )
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
            await sendNotification( partnerAccount?.deviceToken, driverPartnerAccountNotificationMessage, driverPartnerAccountNotificationTitleMessage, trip )
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
            await sendNotification( accountAccess?.deviceToken, driverCompanyAccountNotificationMessage, driverCompanyAccountNotificationTitleMessage, trip )
          }
        }
      }

      
    }

    
    // trips.forEach((trip) => {
    //   const message = `Your trip with ID ${trip.trip_id} is scheduled to begin in 15 minutes. Kindly prepare accordingly.`;
    //   ids.push(trip._id);

    //   if (trip?.driver_name?.deviceToken) {
    //     notifications.push(
    //       sendNotification(
    //         trip?.driver_name?.deviceToken,
    //         message,
    //         message,
    //         trip
    //       )
    //     );
    //   }
    // });
    // const res = await Promise.all(notifications);

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


// Schedule the task using cron
cron.schedule("* * * * *", () => {

  // console.log('running evry minute' , new Date())

  // Send push notification to driver and company when trip will start in 20 minutes
  checkTripsAndSendNotifications();
  // logoutDriverAfterThreeHour()
});

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
