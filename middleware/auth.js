const { verify } = require("crypto");
const jwt = require("jsonwebtoken");
const constant = require("../config/constant");
const user_model = require("../models/user/user_model");
const driver_model = require("../models/user/driver_model");
const mongoose = require("mongoose");

// const config = process.env
verifyToken = async (req, res, next) => {

  try {
    let token = req.headers["x-access-token"];
    let platform = req.headers.platform;
    let isMobile = platform == "mobile";
    req.isMobile = isMobile;
    if (!token) {
      return res.send({
                        status: 400,
                        message: res.__('auth.error.tokenError'),
                      });
    } else {
      jwt.verify(token, process.env.JWTSECRET, async (err, decoded) => {
        if (err) {
          return res.send({
                            code: constant.tokenError,
                            Message: res.__('auth.error.authTokenVerificationFailed'),
                          });
        }

        const now = new Date();
        const threeHoursBefore = new Date(now.getTime() - 3 * 60 * 60 * 1000);
        let query = { _id: decoded?.userId, is_deleted: false };


        if (!decoded?.companyPartnerAccess) { // when driver is not access the company account using the partner account

          if (isMobile) {
            query.jwtTokenMobile = token;
            query.lastUsedTokenMobile = { $gte: threeHoursBefore };
          } else {
            query.jwtToken = token;
            query.lastUsedToken = { $gte: threeHoursBefore };
          }
        }

        
        let user = await user_model.findOne(query).populate("created_by").populate("driverId");

        if (user) {
          const updateLastUse = { [isMobile ? "lastUsedTokenMobile" : "lastUsedToken"]: new Date()};
          user_model.updateOne({ _id: user._id }, updateLastUse);
          if (user?.isDriver) driver_model.updateOne({ _id: user.driverId._id }, updateLastUse);
        }

       
        if (!user) {
          user = await driver_model.findOne(query).populate("created_by");

          if (user) {
            const updateLastUse = { [isMobile ? "lastUsedTokenMobile" : "lastUsedToken"]: new Date() };
            driver_model.updateOne({ _id: user._id }, updateLastUse);
            user = user.toObject();
            user.role = "DRIVER";
          }
        }
        if (!user) {
          return res.send({
                            code: constant.tokenError,
                            message: res.__('auth.error.tokenExpired'),
                          });
          ;
        }

        // blocked check
        if ( user && user.role != "SUPER_ADMIN" &&
          user.role != "DRIVER" &&
          (user?.is_blocked || user?.created_by?.is_blocked)
        ) {

          return res.send({
                            code: constant.tokenError,
                            message: res.__('auth.error.blockedByAdmin'),
                          });
        }
        if (user.role == "DRIVER" && user?.is_blocked) {

          return res.send({
                            code: constant.tokenError,
                            message: res.__('auth.error.blockedByAdmin'),
                          });
        }
        // user=  user.toObject();

        // let company_extra_details = await AGENCY.findOne({user_id: user._id});

        // if (company_extra_details) {
        //   user.company_name = company_extra_details?.company_name;
        // }

        req.user = user;
        req.userId = decoded.userId;
        req.email = decoded.email;
        req.role = decoded.role;

        // When driver accessing the account as Company partner
        if (decoded?.companyPartnerAccess) {

          req.companyPartnerAccess = true;
          req.CompanyPartnerDriverId = decoded.CompanyPartnerDriverId;
          const companyId = decoded.userId;
          const driverHasCompanyPartnerAccess = await driver_model.findOne({
                                                                            _id: decoded.CompanyPartnerDriverId,
                                                                            parnter_account_access  : {
                                                                                                        $elemMatch: { company_id: new mongoose.Types.ObjectId(companyId) },
                                                                                                      },
                                                                          });

          // If company take the access back then user will not continue with his account
          if (!driverHasCompanyPartnerAccess) {
            return res.send({
                              code: constant.REVOKED_ACCOUNT_ERROR,
                              Message: res.__('auth.error.companyAccessWithdrawn'),
                            });
          }
        } else {
          req.companyPartnerAccess = false;
        }
        
        next();
      });
    }
  } catch (err) {
    console.log("🚀 ~ verifyToken= ~ err:", err);
    return res.send({
                    status: constant.tokenError,
                    Message: res.__('auth.error.tokenExpired'),
                  });
    
  }
};
const authJwt = {
  verifyToken: verifyToken,
};
module.exports = authJwt;
