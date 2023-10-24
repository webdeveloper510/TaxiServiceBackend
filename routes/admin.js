var express = require('express');
var router = express.Router();
var loginController = require('../controllers/admin/loginController')
var subAdminController = require('../controllers/admin/subAdminController.js');
var vehicleController = require('../controllers/admin/vehicleController');
var agencyController = require('../controllers/admin/agencyController');
var driverController = require('../controllers/admin/driverController');
var fareController = require('../controllers/admin/fareController');
var tripController = require('../controllers/admin/tripController');
const { verifyToken } = require('../middleware/auth');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/create_super_admin',loginController.create_super_admin)
router.post('/login',loginController.login)

// sub admin api's
router.post('/add_sub_admin',[verifyToken],subAdminController.add_sub_admin)
router.get('/get_sub_admins',[verifyToken],subAdminController.get_sub_admins)
router.get('/get_sub_admin_detail/:userId',[verifyToken],subAdminController.get_sub_admin_detail)
router.put('/edit_sub_admin/:id',[verifyToken],subAdminController.edit_sub_admin)
router.delete('/delete_sub_admin/:id',[verifyToken],subAdminController.delete_sub_admin)


// vehicle api's
router.get('/get_vehicle_types',[verifyToken],vehicleController.get_vehicle_types)
router.post('/add_vehicle',[verifyToken],vehicleController.add_vehicle)
router.get('/get_vehicles',[verifyToken],vehicleController.get_vehicles)
router.get('/edit_vehicle',[verifyToken],vehicleController.edit_vehicle)
router.get('/delete_vehicle',[verifyToken],vehicleController.delete_vehicle)
router.get('/get_vehicle_detail/:id',[verifyToken],vehicleController.get_vehicle_detail)

// agency api's
router.post('/add_agency',[verifyToken],agencyController.add_agency)


// driver api's
router.post('/add_driver',[verifyToken],driverController.add_driver)
router.get('/get_drivers',[verifyToken],driverController.get_drivers)
router.get('/get_driver_detail/:id',[verifyToken],driverController.get_driver_detail)
router.get('/update_driver/:id',[verifyToken],driverController.update_driver)
router.delete('/remove_driver/:id',[verifyToken],driverController.remove_driver)


// fare api's
router.post('/add_fare',[verifyToken],fareController.add_fare)
router.get('/get_fares',[verifyToken],fareController.get_fares)
router.get('/get_fare_detail/:id',[verifyToken],fareController.get_fare_detail)
router.delete('/delete_fare/:id',[verifyToken],fareController.delete_fare)
router.put('/edit_fare/:id',[verifyToken],fareController.edit_fare)



// trip api's
router.post('/add_trip',[verifyToken],tripController.add_trip)
router.get('/get_trip/:status',[verifyToken],tripController.get_trip)
router.get('/get_trip_by_company/:status',[verifyToken],tripController.get_trip_by_company)
router.get('/get_trip/:status',[verifyToken],tripController.get_trip)
router.get('/get_trip_detail/:id',[verifyToken],tripController.get_trip_detail)
router.put('/alocate_driver/:id',[verifyToken],tripController.alocate_driver)





module.exports = router;
