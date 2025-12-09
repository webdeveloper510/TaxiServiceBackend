var express = require('express');
var adminRouter = require('./admin');
var usersRouter = require('./user');
var subAdminRouter = require('./subadmin');
var driverRouter = require('./driver');
var userRouter = require('./user');
var router = express.Router();

router.use('/admin', adminRouter);
router.use('/users', usersRouter);
router.use('/subadmin', subAdminRouter);
router.use('/driver', driverRouter);
router.use('/user', userRouter);


module.exports = router;