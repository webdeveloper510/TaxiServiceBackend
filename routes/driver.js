var express = require('express');
var router = express.Router();
var loginController = require('../controllers/admin/loginController')
var subAdminController = require('../controllers/admin/subAdminController.js');
var vehicleController = require('../controllers/admin/vehicleController');
var agencyController = require('../controllers/admin/agencyController');
var driverController = require('../controllers/subadmin/driverController');
var fareController = require('../controllers/admin/fareController');
var tripController = require('../controllers/subadmin/tripController');
const { verifyToken } = require('../middleware/auth');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

// router.post('/login',driverController.login)
router.post('/verify_otp',driverController.verify_otp)
router.put('/update_driver',[verifyToken],driverController.update_driver)
router.get('/get_driver_detail',[verifyToken],driverController.get_driver_detail)
router.post('/get_reports',[verifyToken],driverController.get_reports)
router.put('/reset_password',[verifyToken],driverController.reset_password)
router.get('/get_trips_for_driver/:status',[verifyToken],driverController.get_trips_for_driver)
router.get('/get_trips_for_drivers/:status',[verifyToken],driverController.get_trips_for_drivers)


// company account access list company_access_list
router.get('/company_access_list/',[verifyToken],driverController.company_access_list)

module.exports = router;