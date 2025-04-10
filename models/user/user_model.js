const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const user = new Schema(
  {
    first_name: {
      type: String,
      default: "",
    },
    last_name: {
      type: String,
      default: "",
    },
    favoriteDrivers: {
      type: [{ type: Schema.Types.ObjectId, ref: "driver" }],
      default: [],
    },
    company_account_access: {
      type: [
        {
          driver_id: {
            type: Schema.Types.ObjectId,
            ref: "driver",
          },
        },
      ],
      default: [],
    },

    parnter_account_access: {
      type: [
        {
          driver_id: {
            type: Schema.Types.ObjectId,
            ref: "driver",
          },
        },
      ],
      default: [],
    },
    email: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
    password: {
      type: String,
      default: "",
    },
    stored_password: {
      type: String,
      default: "",
    },
    profile_image: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "COMPANY", "HOTEL", "ADMIN"],
      default: "HOTEL",
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    is_blocked: {
      type: Boolean,
      default: false,
    },
    deleted_by_id: {
      type: String,
      default: "",
    },
    background_color: {
      type: String,
      default: "#fff",
    },
    logo: {
      type: String,
      default:
        "https://res.cloudinary.com/dtkn5djt5/image/upload/v1701238196/jhw4vir6bftgfzim93qw.avif",
    },
    login_sms_otp_uid: {
      type: String,
      default: "",
    },
    login_sms_otp: {
      type: String,
      default: "",
    },
    is_special_plan_active: { // admin can give this plan to any driver or company then this user can't take any plan and he can use the system
      type: Boolean,
      default: false,
    },
    OTP: {
      type: String,
      default: "",
    },
    otp_expiry: {
      type: Date,
    },
    is_email_verified: {
      type: Boolean,
      default: false,
    },
    is_phone_verified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Boolean,
      default: true,
    },
    commission: {
      type: Number,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    totalBalance: {
      type: Number,
      default: 0,
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
    deviceToken: {
      type: String,
      default: "",
    },
    isDriver: {
      type: Boolean,
      default: false,
    },
    isDriverDeleted: {
      type: Boolean,
      default: false,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "driver",
      default: null,
    },
    jwtToken: {
      type: String,
      default: null,
    },
    lastUsedToken: {
      type: Date,
      default: Date.now(),
    },
    jwtTokenMobile: {
      type: String,
      default: null,
    },
    lastUsedTokenMobile: {
      type: Date,
      default: Date.now(),
    },
    stripeCustomerId: { // for the subscription payments
      type: String,
      default: "",
    },
    connectedAccountId: { // for the payout payments
      type: String,
      default: "",
    },
    isAccountAttched: { // if user bank's account detail is attached with stripe connect account during the onboarding
      type: Boolean,
      default: false,
    },
    // isExternalAccountVerified: { // If user bank account with connect is verified by stripe
    //   type: Boolean,
    //   default: false,
    // },
    
  },
  { timestamps: true }
);

module.exports = mongoose.model("user", user);
