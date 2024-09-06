const { verify } = require('crypto');
const jwt = require('jsonwebtoken');
var config = require('../config/constant');
const USER = require('../models/user/user_model');
const constant = require('../config/constant');
const user_model = require('../models/user/user_model');
const driver_model = require('../models/user/driver_model');
const constants = require('../config/constant')


// const config = process.env
 verifyToken = async (req,res,next) => {
  try{
    let token = req.headers["x-access-token"];
    let platform = req.headers.platform;
    let isMobile = platform == "mobile"
    req.isMobile = isMobile
  if (!token) {
      res.send({
        'status':400,
        message:"something went wrong in token"
      })

  }else{
  jwt.verify(token, process.env.JWTSECRET, async(err, decoded) => {
     
      if (err) {
          res.send({
            code: constant.tokenError,
            Message:"auth token verification failed"
          })
          return
      }
    // let checkUser =  USER.findOne({_id:decoded.userId,isDeleted:false})
    // console.log(checkUser.email,'================')
    // if(!checkUser.email){
    //   res.send({
    //     code:constant.error_code,
    //     message:"Token is not valid"
    //   })
    //   return;
    // }
    const now = new Date();
      const threeHoursBefore = new Date(now.getTime() - 3 *60 * 60 * 1000);
      let query = {_id:decoded?.userId, is_deleted: false}
      if(isMobile){
        query.jwtTokenMobile = token;
        query.lastUsedTokenMobile = {$gte:threeHoursBefore};
      }else{
        query.jwtToken = token;
        query.lastUsedToken = {$gte:threeHoursBefore};
      }
    let user = await user_model.findOne(query).populate("created_by").populate("driverId");
   
    if(user){
      let updateLastUse = {}
      if(isMobile){
        updateLastUse.lastUsedTokenMobile = new Date();
      }
      else {
        updateLastUse.lastUsedToken = new Date();
      }
      await user_model.updateOne({_id:user._id},updateLastUse);
    }
    
      if(!user){
        user = await driver_model.findOne(query).populate("created_by");
          console.log("🚀 ~ jwt.verify ~ userdriver:", user)
          if(user){
            if(isMobile){
              user.lastUsedTokenMobile = new Date();
            }
            else {
              user.lastUsedToken = new Date();
            }
           
            // user.is_login = false;
            await user.save()
            user = user.toObject();
            user.role = "DRIVER"
          }
          
      }
      if(!user){

        res.send({
          code: constant.tokenError,
          message:"Token is expired"
        })
        return
      }
      
    if(user && (user.role != "SUPER_ADMIN" && user.role != "DRIVER") && (!user.status || !user?.created_by?.status) ){
      return res.send({
        code: constant.tokenError,
        message: "You are blocked by administration. Please contact administration"
    })
    }
    if(user.role == "DRIVER" && !user?.created_by?.status){
      return res.send({
        code: constant.tokenError,
        message: "You are blocked by administration. Please contact administration"
    })
    }
    req.user = user;
      req.userId = decoded.userId;
      req.email = decoded.email;
      req.role = decoded.role;
      next();
  })
}
  }catch(err) {
  console.log("🚀 ~ verifyToken= ~ err:", err)
  res.send({
    'status':409,
    Message:"Token is expired"
  })
  return
  }
  
};
const authJwt = {
  verifyToken: verifyToken,
};
module.exports = authJwt