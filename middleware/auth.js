const { verify } = require('crypto');
const jwt = require('jsonwebtoken');
var config = require('../config/constant');
const USER = require('../models/user/user_model');
const constant = require('../config/constant');


// const config = process.env
 verifyToken = (req,res,next) => {
  let token = req.headers["x-access-token"];
  console.log('token------', token)
  if (!token) {
      res.send({
        'status':400,
        message:"something went wrong in token"
      })

  }else{
  jwt.verify(token, process.env.JWTSECRET, (err, decoded) => {
      if (err) {
          res.send({
            'status':400,
            Message:"auth token verification failed"
          })
      }
    let checkUser =  USER.findOne({_id:decoded.userId,isDeleted:false})
    console.log(checkUser.email,'================')
    if(!checkUser.email){
      res.send({
        code:constant.error_code,
        message:"Token is not valid"
      })
      return;
    }
      req.userId = decoded.userId;
      req.email = decoded.email;
      req.role = decoded.role;
      next();
  })
}
};
const authJwt = {
  verifyToken: verifyToken,
};
module.exports = authJwt