var express = require('express');
var adminRouter = require('./admin');
var usersRouter = require('./users');
var subAdminRouter = require('./subadmin');
var driverRouter = require('./driver');
var router = express.Router();

router.use('/admin', adminRouter);
router.use('/users', usersRouter);
router.use('/subadmin', subAdminRouter);
router.use('/driver', driverRouter);


module.exports = router;