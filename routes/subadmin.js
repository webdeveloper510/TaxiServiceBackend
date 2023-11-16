var express = require('express');
var router = express.Router();
var loginController = require('../controllers/admin/loginController')
var subAdminController = require('../controllers/admin/subAdminController.js');
var vehicleController = require('../controllers/admin/vehicleController');
var agencyController = require('../controllers/admin/agencyController');
var driverController = require('../controllers/admin/driverController');
var fareController = require('../controllers/admin/fareController');
var tripController = require('../controllers/subadmin/tripController');
const { verifyToken } = require('../middleware/auth');

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});


router.post('/get_trip/:status',[verifyToken],tripController.get_trip)
router.get('/get_counts_dashboard',[verifyToken],tripController.get_counts_dashboard)
router.get('/get_recent_trip',[verifyToken],tripController.get_recent_trip)
router.put('/edit_trip/:id',[verifyToken],tripController.edit_trip)
router.delete('/delete_trip/:id',[verifyToken],tripController.delete_trip)

module.exports = router;