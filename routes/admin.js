var express = require("express");
var router = express.Router();
var loginController = require("../controllers/admin/loginController");
var subAdminController = require("../controllers/admin/subAdminController.js");
var vehicleController = require("../controllers/admin/vehicleController");
var agencyController = require("../controllers/admin/agencyController");
var driverController = require("../controllers/admin/driverController");
var fareController = require("../controllers/admin/fareController");
var tripController = require("../controllers/admin/tripController");
let paymentController = require("../controllers/admin/paymentController.js");
let subscriptionController = require("../controllers/admin/subscriptionController.js");
const { verifyToken } = require("../middleware/auth");
const { adminAuth } = require("../middleware/adminAuth");

/* GET home page. */
router.get("/", function (req, res, next) {
  res.render("index", { title: "Express" });
});

router.get("/get_ios_app_version", loginController.getIosAppVersion);

router.post("/createPaymentSession", loginController.createPaymentSession);

router.post("/create_super_admin", loginController.create_super_admin);
router.post("/login", loginController.login);
router.post("/login_otp_verify", loginController.login_otp_verify);
router.post("/resend_login_otp", loginController.resend_login_otp);

router.post("/send_otp", loginController.send_otp);
router.post("/verify_otp", loginController.verify_otp);
router.post("/forgot_password", loginController.forgot_password);
router.post("/reset_password", [verifyToken], loginController.reset_password);
router.get("/get_token_detail",[verifyToken],loginController.get_token_detail);

// feedback api's
router.post("/save_feedback", [verifyToken], loginController.save_feedback);
router.get("/get_feedback", [verifyToken], loginController.get_feedback);

// Admin APIS

router.post("/add_admin", [verifyToken], subAdminController.add_admin);
router.get("/admin_list", [verifyToken], subAdminController.admin_list);
router.get(
  "/get_admin_details/:id",
  [verifyToken],
  subAdminController.get_admin_details
);
router.put(
  "/update_admin_details/:id",
  [verifyToken],
  subAdminController.update_admin_details
);
router.delete(
  "/delete_admin/:id",
  [verifyToken],
  subAdminController.delete_admin
);

// sub admin api's
router.post("/add_sub_admin", [verifyToken], subAdminController.add_sub_admin);
router.post( "/search_company", [verifyToken], subAdminController.search_company);
router.post( "/all_company_list", [verifyToken], subAdminController.companyList);
router.post( "/company_revenue_details/:company_id", [verifyToken], subAdminController.companyRevenueDetails);
router.post( "/driver_revenue_details/:driver_id", [verifyToken], subAdminController.driverRevenueDetails);
router.post( "/hotel_revenue_details/:hotel_id", [verifyToken], subAdminController.hotelRevenueDetails);
router.post("/access_search_company",[verifyToken],subAdminController.access_search_company);
router.get("/send_request_trip/:id",[verifyToken],subAdminController.send_request_trip);
router.post("/favoriteDriver/:id",[verifyToken],subAdminController.favoriteDriver);
router.get("/get_sub_admins", [verifyToken], subAdminController.get_sub_admins);
router.get("/get_sub_admin_detail/:userId",subAdminController.get_sub_admin_detail);
router.put("/edit_sub_admin/:id",[verifyToken],subAdminController.edit_sub_admin);
router.put("/edit_hotel_admin/:id",[verifyToken],subAdminController.editHotel);
router.post("/hotel_list_admin",[verifyToken],subAdminController.hotelListAdmin);
router.delete("/delete_sub_admin/:id",[verifyToken],subAdminController.delete_sub_admin);

// vehicle api's
router.get("/get_vehicle_types", vehicleController.get_vehicle_types);
router.post("/add_vehicle", [verifyToken], vehicleController.add_vehicle);
router.post("/admin_add_vehicle/:driverId", [verifyToken], vehicleController.adminAddVehicle);
router.get("/get_vehicles", [verifyToken], vehicleController.get_vehicles);
router.get( "/get_vehicles_by_driverid/:id", [verifyToken], vehicleController.get_vehicles_by_driverid);
router.get( "/get_vehicles_with_type/:vehicle_type", [verifyToken], vehicleController.get_vehicles_with_type );
router.post("/block_driver", [verifyToken , adminAuth], vehicleController.blockDriver);
router.post("/admin_get_all_vehicle", [verifyToken , adminAuth], vehicleController.adminGetAllVehicle);

router.get(
  "/get_vehicle_type/:vehicle_type",
  [verifyToken],
  vehicleController.get_vehicle_type
);
router.put("/edit_vehicle/:id", [verifyToken], vehicleController.edit_vehicle);
router.delete("/delete_vehicle/:id",[verifyToken],vehicleController.delete_vehicle);
router.delete("/admin_delete_vehicle/:id",[verifyToken , adminAuth],vehicleController.adminDeleteVehicle);
router.get("/get_vehicle_detail/:id",[verifyToken],vehicleController.get_vehicle_detail);

// agency api's
router.post("/add_agency", [verifyToken], agencyController.add_agency);

// driver api's
router.post("/add_driver", driverController.add_driver);
router.post("/admin_add_driver",[verifyToken] , driverController.adminAddDriver);
router.get("/get_drivers", [verifyToken], driverController.get_drivers);
router.get("/get_drivers_list", [verifyToken], driverController.get_drivers_list);
router.post("/get_drivers_super",[verifyToken],driverController.get_drivers_super);
router.get("/deleted_drivers",[verifyToken],driverController.get_deleted_drivers_super);
router.get("/get_driver_detail/:id",[verifyToken],driverController.get_driver_detail);
router.put("/update_driver/:id", [verifyToken], driverController.update_driver);
router.delete("/remove_driver/:id",[verifyToken], driverController.remove_driver);
router.put("/updateLocation", [verifyToken], driverController.updateLocation);
router.post("/updateVerification/:id",[verifyToken],driverController.updateVerification);
router.post("/rejectVerification/:id",[verifyToken],driverController.rejectVerification
);
router.post("/convertDriver",[verifyToken],driverController.convertIntoDriver);
router.post("/switchDriver", [verifyToken], driverController.switchToDriver);
router.post("/switchCompany", [verifyToken], driverController.switchToCompany);
router.get("/switchDriverToPartnerCompany/:companyId", [verifyToken], driverController.switchDriverToPartnerCompany);

router.put("/logout", [verifyToken], driverController.logout);
router.get("/get_active_drivers",[verifyToken],driverController.get_active_drivers);

// fare api's
router.post("/add_fare", [verifyToken], fareController.add_fare);
router.post(
  "/access_get_fares",
  [verifyToken],
  fareController.access_get_fares
);
router.get("/get_fares", [verifyToken], fareController.get_fares);
router.get("/company_get_fares/:company_id", [verifyToken], fareController.companyGetFares);
router.get("/get_fares/:id", fareController.get_fares);
router.get(
  "/get_fare_detail/:id",
  [verifyToken],
  fareController.get_fare_detail
);
router.delete("/delete_fare/:id", [verifyToken], fareController.delete_fare);
router.put("/edit_fare/:id", [verifyToken], fareController.edit_fare);

// trip api's
router.post("/add_trip", [verifyToken], tripController.add_trip);
router.post("/access_add_trip", [verifyToken], tripController.access_add_trip);
router.post("/add_trip1", tripController.add_trip1);
router.get("/check_company_id/:company_id", tripController.check_company_id);
router.post("/add_trip_link", tripController.add_trip_link);
router.post("/get_trip/:status", [verifyToken], tripController.get_trip);
router.post("/company_get_trip/:status", [verifyToken], tripController.companyGetTrip);
router.post("/driver_get_trip/:status", [verifyToken], tripController.driverGetTrip);
router.post("/hotel_get_trip/:status", [verifyToken], tripController.HotelGetTrip);
router.post("/company_hotel_list/:company_id", [verifyToken], subAdminController.companyHotelList);
router.post("/get_access_trip/:status",[verifyToken],tripController.get_access_trip);
router.post("/get_all_access_trip/:status",[verifyToken],tripController.get_all_access_trip);

router.post( "/get_trip_for_hotel/:status", [verifyToken], tripController.get_trip_for_hotel);
router.post("/get_recent_trip", [verifyToken], tripController.get_recent_trip);
router.post("/get_recent_trip_super",[verifyToken],tripController.get_recent_trip_super);
router.post( "/get_trip_by_company/:status", [verifyToken], tripController.get_trip_by_company);
router.get("/get_trip_detail/:id", tripController.get_trip_detail);
router.get("/access_get_trip_detail/:id/:company_id",[verifyToken],tripController.access_get_trip_detail);
router.put("/alocate_driver/:id", [verifyToken], tripController.alocate_driver);
router.put("/access_alocate_driver/:id", [verifyToken], tripController.access_alocate_driver);
router.get("/check_trip_request/:id", tripController.check_trip_request);
router.get("/get_counts_dashboard",[verifyToken],tripController.get_counts_dashboard);

// trip payment
router.post("/pay_trip_commission/:id",[verifyToken],paymentController.tripCommissionPayment);
router.post("/failed_trip_commission/:id",[verifyToken],paymentController.failedTripPay);
router.post("/success_trip_commission/:id",[verifyToken],paymentController.successTripPay);
router.get("/transactions",[verifyToken],paymentController.getCommissionTrans);
router.get("/admin_transaction",[verifyToken , adminAuth],paymentController.adminTransaction);
router.post("/payCompany", [verifyToken], paymentController.payCompany);
router.get("/admin_update_payment/:id", [verifyToken , adminAuth], paymentController.adminUpdatePayment);


// Account access API
router.post("/update_account_access",[verifyToken],subAdminController.update_account_access);
router.post("/update_partner_account_access",[verifyToken],subAdminController.updatePartnerAccountAccess);
router.get("/get_driver_list",[verifyToken],subAdminController.get_driver_list);
router.get("/getPartnerDriverList",[verifyToken],subAdminController.getPartnerDriverList);
router.get("/settings",[verifyToken , adminAuth],fareController.adminSettings);
router.post("/upate_settings",[verifyToken , adminAuth],fareController.updateAdminSettings);

// Subscription APIs
router.get("/get_subscriptions_products_from_stripe",subscriptionController.getSubscriptionProductsFromStripe);
router.get("/create_tax",subscriptionController.createTax);
router.get("/get_products",[verifyToken] ,subscriptionController.getProducts);
router.get("/get_plans",subscriptionController.getProducts);
router.post("/update_products/:id",[verifyToken , adminAuth] ,subscriptionController.updateProducts);
router.post("/create_payment_intent",[verifyToken] ,subscriptionController.createPaymentIntent);
router.get("/create-setup-intent",[verifyToken] ,subscriptionController.createSetupIntent);
router.post("/create-ideal-checkout-session",[verifyToken] ,subscriptionController.createIdealCheckoutSession);// IDEAL and SEPA subscription functionality
router.post("/create-subscription",[verifyToken] ,subscriptionController.createSubscription);
router.post("/cancel-subscription",[verifyToken] ,subscriptionController.cancelSubscription);
router.get("/get-my-paid-plans",[verifyToken] ,subscriptionController.getMyPaidPlans);
// router.post("/subscription_webhook" , subscriptionController.subscriptionWebhook);

// Connected account Api's
router.get("/user-onboard-on-stripe/:id" , subscriptionController.userOnboardOnStripe); // user will submit all the details to attach the bank account detail to strripe connected account
router.get("/get-connected-account-details/:id" , subscriptionController.getConnectedAccountDetails);

module.exports = router;
