var express = require('express');
var router = express.Router();
var loginController = require('../controllers/admin/loginController')
var subAdminController = require('../controllers/admin/subAdminController.js');
var vehicleController = require('../controllers/admin/vehicleController');
var agencyController = require('../controllers/admin/agencyController');
var driverController = require('../controllers/admin/driverController');
var fareController = require('../controllers/admin/fareController');
var tripController = require('../controllers/subadmin/tripController');
var priceUploadController = require('../controllers/subadmin/priceUploadController');
const { verifyToken } = require('../middleware/auth');
const { companyAuth } = require("../middleware/companyAuth");
/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});


router.post('/get_trip/:status',[verifyToken],tripController.get_trip)
router.get('/get_counts_dashboard',[verifyToken],tripController.get_counts_dashboard)
router.post('/get_recent_trip',[verifyToken],tripController.get_recent_trip)
router.put('/edit_trip/:id',[verifyToken],tripController.edit_trip);
router.put('/driver_cancel_trip/:id',[verifyToken],tripController.driverCancelTrip)
router.put('/driver_cancel_trip_decision/:id',[verifyToken],tripController.driverCancelTripDecision)
router.post('/driver_cancel_trip_requests',[verifyToken],tripController.driverCancelTripRequests)
router.post('/customer_cancel_trip' , tripController.customerCancelTrip)
router.put('/no-show-user/:id',[verifyToken],tripController.noShowUser)
router.put('/access_edit_trip/:id/:company_id',[verifyToken],tripController.access_edit_trip)
router.delete('/delete_trip/:id',[verifyToken],tripController.delete_trip)
router.post('/get_recent_trip',[verifyToken],tripController.get_recent_trip)

// Upload price feautre
router.post('/upload_price',[verifyToken , companyAuth],priceUploadController.priceUpload )
router.post('/get_uploaded_price',[verifyToken , companyAuth],priceUploadController.getUploadedPrice)
router.delete('/delete_uploaded_price',[verifyToken , companyAuth],priceUploadController.deleteUploadedPrice)
router.put('/disabled_uploaded_prices',[verifyToken , companyAuth],priceUploadController.disabledUploadedPrices)
router.get('/get_all_uploaded_price',[verifyToken],priceUploadController.getAllUploadedPrice)
router.post('/get_all_uploaded_price_for_hotel/:id', priceUploadController.getAllUploadedPriceForHotel)
router.get('/get_access_all_uploaded_price/:id',[verifyToken],priceUploadController.getAccessAllUploadedPrice)
router.post('/update_uploaded_price/:id',[verifyToken , companyAuth],priceUploadController.upateUploadedPrice)
module.exports = router;