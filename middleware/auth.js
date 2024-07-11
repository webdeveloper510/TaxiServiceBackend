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
      const threeHoursBefore = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    let user = await user_model.findOne({_id:decoded?.userId, is_deleted: false, jwtToken:token,lastUsedToken:{$gte:threeHoursBefore}}).populate("created_by").populate("driverId");
    if(user){
      await user_model.updateOne({_id:user._id},{lastUsedToken:new Date()});
    }
    
      if(!user){
        user = await driver_model.findOne({_id:decoded?.userId,is_deleted:false,lastUsedToken:{$gte:threeHoursBefore}}).populate("created_by");
          if(user){
            user.lastUsedToken = new Date();
            await user.save()
            user = user.toObject();
            user.role = "DRIVER"
            if(user.jwtToken != token){
              res.send({
                code: constant.tokenError,
                message:"Token is expired"
              })
              return
            }
          }
      }
      if(!user){

        res.send({
          code: constant.tokenError,
          message:"user not found"
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
    'status':400,
    Message:"auth token verification failed"
  })
  return
  }
  
};
const authJwt = {
  verifyToken: verifyToken,
};
module.exports = authJwt