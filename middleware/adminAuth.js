const { verify } = require("crypto");
const CONSTANT = require("../config/constant");

// const config = process.env
const adminAuthMiddleware = async (req, res, next) => {
  try {
    
    if (req.user.role == CONSTANT.ROLES.ADMIN || req.user.role == CONSTANT.ROLES.SUPER_ADMIN) {

        next();
    } else {
      return res.send({
            status: CONSTANT.error_code,
            Message: "You do not have the necessary permissions to perform this action.",
          });
    
    }
    
  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌Error admin auth middleware:', err.message);
    return res.send({
      status: CONSTANT.error_code,
      Message: "You do not have the necessary permissions to perform this action.",
    });
  }
};
const adminAuth = {
    adminAuth: adminAuthMiddleware,
};
module.exports = adminAuth;