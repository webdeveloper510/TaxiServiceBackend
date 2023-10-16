var express = require('express');
var router = express.Router();
var loginController = require('../controllers/admin/loginController')

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

router.post('/create_super_admin',loginController.create_super_admin)
router.post('/login',loginController.login)


module.exports = router;
