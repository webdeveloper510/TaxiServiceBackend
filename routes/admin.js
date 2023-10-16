var express = require('express');
var router = express.Router();
var loginController = require('../controllers/admin/loginController')
var subAdminController = require('../controllers/admin/subAdminController.js');
var vehicleController = require('../controllers/admin/vehicleController');
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
router.get('/get_sub_admin_detail/:id',[verifyToken],subAdminController.get_sub_admin_detail)
router.put('/edit_sub_admin/:id',[verifyToken],subAdminController.edit_sub_admin)
router.delete('/delete_sub_admin/:id',[verifyToken],subAdminController.delete_sub_admin)


// vehicle api's
router.get('/get_vehicle_types',[verifyToken],vehicleController.get_vehicle_types)
router.post('/add_vehicle',[verifyToken],vehicleController.add_vehicle)



module.exports = router;
