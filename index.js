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
const { initSocket } = require("./sockets");
const cleanupOrphanDrivers = require("./utils/cleanupOrphanDrivers.js")
// view engine setup



// Apply raw body parser specifically for Stripe webhook

const payoutWebhook = require('./routes/webhooks/payoutWebhook'); // exports webhook handler function
app.post('/payout_webhook', bodyParser.raw({ type: 'application/json' }), payoutWebhook); // webhook for compnay payout

const subscriptionWebhook = require('./routes/webhooks/subscription.webhook'); // exports webhook handler function
app.post('/subscription_webhook', bodyParser.raw({ type: 'application/json' }), subscriptionWebhook); // webhook for subscription and chekcout

// IMPORTANT: initialize sockets
const io = initSocket(httpServer);

startAllCrons(io);
app.disable('x-powered-by')
app.use(logger("dev"));
app.use(i18n.init);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
// const io = new Server(httpServer, {
//                                     cors: {
//                                       origin: "*",
//                                     },
//                                   }
//                       );



app.use((req, res, next) => {
  
  const lang = req.query.lang || req.headers['accept-language'];
  if (lang) {
    req.setLocale(lang);
  }
  req.io = io; // attach io to req for routes if you need it
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
    
    const invoice = await stripe.invoices.retrieve("in_1SaXKXKNzdNk7dDQB94wlx6Y");

    // 1) Get the PaymentIntent
const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent);

// 2) Get the latest charge
const latestChargeId = paymentIntent.latest_charge; // e.g. "py_3SaXKPKNzdNk7dDQ1Yhwfzi9"

if (!latestChargeId) {
  // payment still processing / not charged yet
  // handle this case (show "still processing" to user)
}

const charge = await stripe.charges.retrieve(latestChargeId);

// 3) This is the URL for the PDF you like (Ontvangstbewijs)
const receiptUrl = charge.receipt_url;

    console.log("Receipt URL:", receiptUrl);

    return res.send({
                      code: 200,
                      message: "weekly-company-payment",
                      receiptUrl,
                      // pi
                      paymentIntent
                    });
  } catch (error) {
    
    console.log("❌❌❌❌❌❌❌❌❌Error weekly-company-payment:", error);
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

/**
 * 🔥 RUN CODE AFTER MONGO DB IS CONNECTED
 */
mongoose.connection.once('open', async () => {
  console.log("📡 MongoDB connected (once)");

  await cleanupOrphanDrivers(io);   // <--- Your custom function with socket

  console.log("✅ postDbInit() finished running.");
});


app.use(function (req, res, next) {
  next(createError(404));
});


module.exports = app;
