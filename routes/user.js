var express = require('express');
var router = express.Router();
var customerController = require('../controllers/user/customerController');
/* GET users listing. */
router.get('/', function(req, res, next) {
  res.send('respond with a resource');
});

router.post('/trips/:trip_id/rating' , customerController.addTripRating);
module.exports = router;
