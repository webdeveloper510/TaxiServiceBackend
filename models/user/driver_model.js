const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const driver = new Schema(
  {
    first_name: {
      type: String,
      default: "",
    },
    last_name: {
      type: String,
      default: "",
    },
    bankNumber: {
      type: String,
      default: "",
    },
    companyName: {
      type: String,
      default: "",
    },
    kvk: {
      type: String,
      default: "",
    },
    address_2: {
      type: String,
      default: "",
    },
    address_1: {
      type: String,
      default: "",
    },
    city: {
      type: String,
      default: "",
    },
    country: {
      type: String,
      default: "",
    },
    zip_code: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
      index: true,
    },
    phone: {
      type: String,
      default: "",
      index: true,
    },
    password: {
      type: String,
      default: "",
    },
    stored_password: {
      type: String,
      default: "",
    },
    company_account_access: { // driver can access the company acounts trip only
      type: [
        {
          company_id: {
            type: Schema.Types.ObjectId,
            ref: "user",
          },
        },
      ],
      default: [],
    },

    parnter_account_access: { // driver will login the company account with all access
      type: [
        {
          company_id: {
            type: Schema.Types.ObjectId,
            ref: "user",
          },
        },
      ],
      default: [],
    },
    favoriteDrivers: {
      type: [{ type: Schema.Types.ObjectId, ref: "driver" }],
      default: [],
    },
    deviceToken: {
      type: String,
      default: null,
    },
    profile_image: {
      type: String,
      default:
        "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg",
    },
    driver_documents: {
      type: String,
      default: "",
    },
    OTP: {
      type: String,
      default: "a0",
    },
    role: {
      type: String,
      default: "DRIVER",
    },
    gender: {
      type: String,
      default: "",
    },
    is_available: {
      type: Boolean,
      default: true,
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    is_blocked: {
      type: Boolean,
      default: false,
    },
    currently_active_company: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: null,
    },
    agency_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    deleted_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
    },
    status: {
      type: Boolean,
      default: true,
    },
    auto_accept: {
      type: Boolean,
      default: false,
    },
    driver_status: {
      type: String,
      enum: ["Active", "Inactive"],
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    isBlocked: {
      type: Boolean,
      default: false,
    },
    isDocUploaded: {
      type: Boolean,
      default: false,
    },
    location: {
      type: {
        type: String,
        enum: ["Point"],
        default: "Point",
        require: true,
      },
      coordinates: {
        type: [Number],
        default: [null, null],
      },
    },
    is_login: {
      type: Boolean,
      default: false,
    },
    is_special_plan_active: { // admin can give this plan to any driver or company then this user can't take any plan and he can use the system
      type: Boolean,
      default: false,
    },
    locationUpdatedAt: {
      type: Date,
      default: Date.now,
    },
    isSocketConnected: {
      type: Boolean,
      default: false,
    },
    socketId: {
      type: String,
      default: null,
    },
    isWebSocketConnected: {
      type: Boolean,
      default: false,
    },
    webSocketId: {
      type: String,
      default: null,
    },
    nickName: {
      type: String,
      default: "",
    },
    isCompany: {
      type: Boolean,
      default: false,
    },
    driver_company_id:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    company_agency_id:{
      type: mongoose.Schema.Types.ObjectId,
      ref: "agency",
      default: null,
    },
    lastUsedToken: {
      type: Date,
      default: Date.now(),
    },
    jwtToken: {
      type: String,
      default: "",
    },
    lastUsedTokenMobile: {
      type: Date,
      default: Date.now(),
    },
    jwtTokenMobile: {
      type: String,
      default: "",
    },
    currentTrip: { 
      type: Schema.Types.ObjectId, 
      ref: "trip", 
      default: null 
    },
    defaultVehicle: {
      type: Schema.Types.ObjectId,
      ref: "vehicle",
      default: null,
    },
    stripeCustomerId: {
      type: String,
      default: "",
    },
    driverCounterId: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("driver", driver);
