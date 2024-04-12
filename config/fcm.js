require("dotenv").config()

var FCM = require('fcm-node');
const e = require('express')
var serverKey = process.env.FCM_SERVER_KEY
var fcm = new FCM(serverKey);

module.exports = fcm