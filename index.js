require("dotenv").config()
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const db = require('./config/db')
const http = require('http')
const cors = require('cors')
const User = require('./models/user/user_model')
var adminRouter = require('./routes/admin');
var usersRouter = require('./routes/users');
var subAdminRouter = require('./routes/subadmin');
var driverRouter = require('./routes/driver');
const { Server } = require("socket.io");
const { driverDetailsByToken, userDetailsByToken } = require("./Service/helperFuntion");
const driver_model = require("./models/user/driver_model");
var app = express();
app.use(cors())
const httpServer = http.createServer(app)
// view engine setup

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
const io = new Server(httpServer, {
  cors: {
    origin: "*",
  },
});
app.use((req, res, next) => {
  req.io = io; // Set the io object in the request object
  next();
});

app.use('/uploads/',express.static('./uploads'))

app.use('/admin', adminRouter);
app.use('/users', usersRouter);
app.use('/subadmin', subAdminRouter);
app.use('/driver', driverRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

const PORT = process.env.PORT
httpServer.listen(PORT,()=>console.log(`app listening at http://localhost:${PORT}`))




io.on("connection", (socket) => {
  socket.on("addNewDriver", async ({ token, longitude, latitude }) => {

    const driverByToken = await driverDetailsByToken(token);
    console.log("🚀 ~ file: index.js:70 ~ socket.on ~ driverByToken:", driverByToken)
    
    if (driverByToken) {
      driverByToken.location = {
        type: "Point",
        coordinates: [longitude, latitude],
      };
      driverByToken.locationUpdatedAt = new Date();
      driverByToken.isSocketConnected = true;
      driverByToken.socketId = socket.id;
      await driverByToken.save();
      io.to(socket.id).emit("driverConnection",{
        code:200,
        message: "connected successfully with driver id: " + driverByToken._id
      })
    }
  });
  socket.on("addUser", async ({ token }) => {

    const userByToken = await userDetailsByToken(token);
    console.log("🚀 ~ file: index.js:70 ~ socket.on ~ driverByToken:", userByToken)
    
    if (userByToken) {
      userByToken.isSocketConnected = true;
      userByToken.socketId = socket.id;
      await userByToken.save();
      io.to(socket.id).emit("userConnection",{
        code:200,
        message: "connected successfully with user id: " + userByToken._id
      })
    }
  });
  socket.on("updateDriverLocation", async ({ longitude, latitude }) => {
    const driverBySocketId = await driver_model.findOne({ socketId: socket.id });
    if (driverBySocketId) {
      driverBySocketId.location = {
        type: "Point",
        coordinates: [longitude, latitude],
      };
      driverBySocketId.locationUpdatedAt = new Date();
      await driverBySocketId.save();
      io.to(socket.id).emit("UpdateLocationDriver", {
        code: 200,
        message: "location updated successfully"
      } )
      
    }
  });
  socket.on("disconnect", async () => {
    const driverBySocketId = await driver_model.findOne({ socketId: socket.id });
    if (driverBySocketId) {
      driverBySocketId.isSocketConnected = false;
      driverBySocketId.socketId = null;
      await driverBySocketId.save();
    }
  });
});



module.exports = app;
