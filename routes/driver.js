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

router.put('/signup-documents/:id',[verifyToken],driverController.uploadSignupDocuments);
router.put('/resubmit-documents/:driverId' , [verifyToken] , driverController.resubmitRejectedDocuments);
router.put('/kyc/profile-photo/:driverId' , [verifyToken] , driverController.updateDriverProfilePhotoDoc);
router.post('/companies/driver-profile' , [verifyToken] , driverController.createDriverProfileFromCompany);

router.put('/change_driver_availability',[verifyToken],driverController.changeDriverAvailability)
router.put('/change_driver_state',[verifyToken],driverController.changeDriverState)
router.get('/get_driver_detail',[verifyToken],driverController.get_driver_detail)
router.post('/get_reports',[verifyToken],driverController.get_reports)
router.put('/reset_password',[verifyToken],driverController.reset_password)
router.get('/get_trips_for_driver/:status',[verifyToken],driverController.get_trips_for_driver)
router.get('/get_trips_for_drivers/:status',[verifyToken],driverController.get_trips_for_drivers)
router.get('/get_all_trips_for_drivers/:status',[verifyToken],driverController.getAllTripsForDrivers)
router.get('/get_trips_count_for_drivers/:status',[verifyToken],driverController.getTripsCountForDrivers)
router.get('/get_under_cancelled_trips_count_for_drivers',[verifyToken],driverController.getUnderTripCancelledTripsCountForDrivers)


// company account access list company_access_list
router.get('/company_access_list/',[verifyToken],driverController.company_access_list)
router.get('/favorite_driver/:id',[verifyToken],driverController.favoriteDriver)
router.get('/get_driver_list/',[verifyToken],driverController.getDriverList)
router.post('/trip/:unique_trip_code/company',driverController.getRideWithCompany)

module.exports = router;