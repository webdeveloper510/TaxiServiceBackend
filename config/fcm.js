require("dotenv").config()

var FCM = require('fcm-node');
var serverKey = process.env.FCM_SERVER_KEY
var fcm = new FCM(serverKey);

module.exports = fcm