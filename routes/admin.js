var express = require('express');
var router = express.Router();
var loginController = require('../controllers/admin/loginController')
var subAdminController = require('../controllers/admin/subAdminController.js');
var vehicleController = require('../controllers/admin/vehicleController');
var agencyController = require('../controllers/admin/agencyController');
var driverController = require('../controllers/admin/driverController');
var fareController = require('../controllers/admin/fareController');
var tripController = require('../controllers/admin/tripController');
let paymentController = require('../controllers/admin/paymentController.js');
const { verifyToken } = require('../middleware/auth');

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/createPaymentSession', loginController.createPaymentSession)

router.post('/create_super_admin', loginController.create_super_admin)
router.post('/login', loginController.login)
router.post('/send_otp', loginController.send_otp)
router.post('/verify_otp', loginController.verify_otp)
router.post('/forgot_password', loginController.forgot_password)
router.post('/reset_password', [verifyToken], loginController.reset_password)
router.get('/get_token_detail', [verifyToken], loginController.get_token_detail)

// feedback api's
router.post('/save_feedback', [verifyToken], loginController.save_feedback)
router.get('/get_feedback', [verifyToken], loginController.get_feedback)




// sub admin api's
router.post('/add_sub_admin', [verifyToken], subAdminController.add_sub_admin)
router.post('/search_company', [verifyToken], subAdminController.search_company)
router.get('/send_request_trip/:id', [verifyToken], subAdminController.send_request_trip)
router.post('/favoriteDriver/:id', [verifyToken], subAdminController.favoriteDriver)
router.get('/get_sub_admins', [verifyToken], subAdminController.get_sub_admins)
router.get('/get_sub_admin_detail/:userId', subAdminController.get_sub_admin_detail)
router.put('/edit_sub_admin/:id', [verifyToken], subAdminController.edit_sub_admin)
router.delete('/delete_sub_admin/:id', [verifyToken], subAdminController.delete_sub_admin)


// vehicle api's
router.get('/get_vehicle_types', vehicleController.get_vehicle_types)
router.post('/add_vehicle', [verifyToken], vehicleController.add_vehicle)
router.get('/get_vehicles', [verifyToken], vehicleController.get_vehicles)
router.get('/get_vehicles_with_type/:vehicle_type', [verifyToken], vehicleController.get_vehicles_with_type)
router.get('/get_vehicle_type/:vehicle_type', [verifyToken], vehicleController.get_vehicle_type)
router.put('/edit_vehicle/:id', [verifyToken], vehicleController.edit_vehicle)
router.delete('/delete_vehicle/:id', [verifyToken], vehicleController.delete_vehicle)
router.get('/get_vehicle_detail/:id', [verifyToken], vehicleController.get_vehicle_detail)

// agency api's
router.post('/add_agency', [verifyToken], agencyController.add_agency)


// driver api's
router.post('/add_driver', driverController.add_driver)
router.get('/get_drivers', [verifyToken], driverController.get_drivers)
router.get('/get_drivers_super', [verifyToken], driverController.get_drivers_super)
router.get('/get_driver_detail/:id', [verifyToken], driverController.get_driver_detail)
router.put('/update_driver/:id', [verifyToken], driverController.update_driver)
router.delete('/remove_driver/:id', [verifyToken], driverController.remove_driver)
router.put('/updateLocation', [verifyToken], driverController.updateLocation)
router.post('/updateVerification/:id', [verifyToken], driverController.updateVerification)

router.put('/logout', [verifyToken], driverController.logout)
router.get('/get_active_drivers', [verifyToken], driverController.get_active_drivers)


// fare api's
router.post('/add_fare', [verifyToken], fareController.add_fare)
router.get('/get_fares', [verifyToken], fareController.get_fares)
router.get('/get_fares/:id', fareController.get_fares)
router.get('/get_fare_detail/:id', [verifyToken], fareController.get_fare_detail)
router.delete('/delete_fare/:id', [verifyToken], fareController.delete_fare)
router.put('/edit_fare/:id', [verifyToken], fareController.edit_fare)



// trip api's
router.post('/add_trip', [verifyToken], tripController.add_trip)
router.post('/add_trip_link', tripController.add_trip_link)
router.post('/get_trip/:status', [verifyToken], tripController.get_trip)
router.post('/get_trip_for_hotel/:status', [verifyToken], tripController.get_trip_for_hotel)
router.post('/get_recent_trip', [verifyToken], tripController.get_recent_trip)
router.post('/get_recent_trip_super', [verifyToken], tripController.get_recent_trip_super)
router.post('/get_trip_by_company/:status', [verifyToken], tripController.get_trip_by_company)
router.get('/get_trip_detail/:id', tripController.get_trip_detail)
router.put('/alocate_driver/:id', [verifyToken], tripController.alocate_driver)
router.get('/get_counts_dashboard', [verifyToken], tripController.get_counts_dashboard)

// trip payment
router.post('/pay_trip_commission/:id', [verifyToken], paymentController.tripCommissionPayment);
router.post('/failed_trip_commission/:id', [verifyToken], paymentController.failedTripPay);
router.post('/success_trip_commission/:id', [verifyToken], paymentController.successTripPay);
router.get("/transactions",[verifyToken], paymentController.getCommissionTrans);
router.post('/payCompany', [verifyToken], paymentController.payCompany );





module.exports = router;
