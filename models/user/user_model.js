const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const CONSTANT = require("../../config/constant");
const ROLES_ENUM_WITHOUT_DRIVER = Object.values(CONSTANT.ROLES).filter(role => role !== CONSTANT.ROLES.DRIVER);
const TRIP_COMMISSION_TYPE_ENUM = Object.values(CONSTANT.TRIP_COMMISSION_TYPE);
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
    user_name: {
      type: String,
      default: "",
      unique: true, // ensures MongoDB index is unique
      // required: true, // optional: force this field to be provided
      trim: true, // optional: remove spaces before/after
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
    countryCode: {
      type: String,
      default: CONSTANT.NETHERLANDS_COUNTRY_CODE,
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
      enum: ROLES_ENUM_WITHOUT_DRIVER,
      default: CONSTANT.ROLES.HOTEL,
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
    settings: {
      
      color_settings: {
                        title_color: { type:String, default: "#27c9cc", },
                        text_color: { type:String,  default: "#01151a", },
                        background_color: { type:String, default: "#ffffff",},
                        font_titles: { type:String, default: "#ffffff", },
                      },
      payment_options: {
                        cash: { // when customer will pay in cash 
                          enabled: { type: Boolean, default: true },
                          fee: { type: Number, default: 0 },
                          percentage: { type: Number, default: 0 },
                          text:{ type: String, default: CONSTANT.PAY_OPTION.CASH }
                        },
                        debit_card: { // when customer will pay through the debit card
                          enabled: { type: Boolean, default: false },
                          fee: { type: Number, default: 0 },
                          percentage: { type: Number, default: 0 },
                          text:{ type: String, default: CONSTANT.PAY_OPTION.DEBIT_CARD }
                        },
                        credit_card: { // when customer will pay through the credit card
                          enabled: { type: Boolean, default: false },
                          fee: { type: Number, default: 0 },
                          percentage: { type: Number, default: 0 },
                          text:{ type: String, default: CONSTANT.PAY_OPTION.CREDIT_CARD }
                        },
                        on_account: { // when customer will pay through the credit card
                          enabled: { type: Boolean, default: false },
                          fee: { type: Number, default: 0 },
                          percentage: { type: Number, default: 0 },
                          text:{ type: String, default: CONSTANT.PAY_OPTION.ON_ACCOUNT }
                        }
        },
        online_cancellation_time: {
          type: Number,
          default: 0
        },
        child_seat_price: { 
          enabled: { type: Boolean, default: true },
          fee: { type: Number, default: 0 },
          text:{ type: String, default: "Child Seat" }
        },
        max_no_of_person: { 
          fee: { type: Number, default: 1 },
          text:{ type: String, default: "Max no of person" }
        },
        sms_options :{
          trip_ceate_request :{ // when ride will create
            enabled: { type: Boolean, default: false },
          },
          driver_on_the_way_request: { // when driver will be on the way for pickup the customer
            enabled: { type: Boolean, default: false },
          },
          changing_pickup_time_request: { // when trip's date and time will be change
            enabled: { type: Boolean, default: false },
          },
        },
        default_web_booking_commission_type: {
                                                
                                                commission_type: {
                                                                    type: String,
                                                                    enum: TRIP_COMMISSION_TYPE_ENUM,
                                                                    default: CONSTANT.TRIP_COMMISSION_TYPE.PERCENTAGE
                                                                  },
                                                commission_value: {
                                                                      type: Number,
                                                                      default: 0
                                                                    }
                                              },
      default: {}
    },
    sms_balance: { type: Number, default: 0 }, // in cents (e.g., 100 = €1.00)
    
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
    webDeviceToken: {
      type: String,
      default: "",
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
