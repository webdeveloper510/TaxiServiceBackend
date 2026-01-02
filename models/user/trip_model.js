const mongoose = require('mongoose')
const { nanoid } = require("nanoid");
const Schema = mongoose.Schema
const CONSTANT = require("../../config/constant");
const PAYMENT_COLLECT_ENUM = Object.values(CONSTANT.PAYMENT_COLLECTION_TYPE);
const PAYOUT_TANSFER_ENUM = Object.values(CONSTANT.PAYOUT_TANSFER_STATUS);
const PAYMENT_OPTION_ENUM = Object.values(CONSTANT.PAY_OPTION);
const TRIP_STATUS_ENUM = Object.values(CONSTANT.TRIP_STATUS);
const NAVIGATION_MODE_ENUM = Object.values(CONSTANT.NAVIGATION_MODE);
const BOOKING_SOURCE_ENUM = Object.values(CONSTANT.BOOKING_SOURCE);
const TRIP_COMMISSION_TYPE_ENUM = Object.values(CONSTANT.TRIP_COMMISSION_TYPE);
const TRIP_CANCELLED_BY_ROLE_ENUM = Object.values(CONSTANT.TRIP_CANCELLED_BY_ROLE);

const trip = new Schema({
    unique_trip_code: {
        type: String,
        unique: true,
        index: true,
    },
    driver_name:{
        type:mongoose.Schema.Types.ObjectId,ref:'driver',
        default:null
    },
    car_type:{
        type:String,
        default:''
    },
    car_type_id:{
        type: Schema.Types.ObjectId,
        ref: "cartypes",
    },
    vehicle_type:{
        type:String,
        default:''
    },
    commission:{
        type:{
            commission_type:{
                type:String,
                enum:TRIP_COMMISSION_TYPE_ENUM
            },
            commission_value: {
                type:Number
            }
        },
        default:{
            commission_type:CONSTANT.TRIP_COMMISSION_TYPE.DEFAULT, //Percentage , Fixed
            commission_value:0
        }
    },
    superAdminPaymentAmount: {
        type: Number,
        required: true,
    },
    companyPaymentAmount: {
        type: Number,
        required: true,
    },
    driverPaymentAmount: {
        type: Number,
        required: true,
    },
    series_id:{
        type:String,
        default:''
    },
    comment:{
        type:String,
        default:''
    },
    pay_option:{
        type:String,
        enum:PAYMENT_OPTION_ENUM
    },
    price:{
        type:Number,
        default:0
    },
    child_seat_price:{
        type:Number,
        default:0
    },
    payment_method_price:{
        type:Number,
        default:0
    },
    pickup_time:{
        type:Date,
        default:Date.now
    },
    navigation_mode:{
        type:String,
        enum:NAVIGATION_MODE_ENUM,
        default: CONSTANT.NAVIGATION_MODE.DEFAULT
    },
    booking_source:{
        type:String,
        enum:BOOKING_SOURCE_ENUM,
        default: CONSTANT.BOOKING_SOURCE.COMPNAY_DASHBOARD
    },
    booking_channel:{
        type:String,
        default: ""
    },
    drop_time:{
        type:Date,
        default:Date.now
    },
    amount:{
        type:Object,
    },
    vehicle:{
        type:mongoose.Schema.Types.ObjectId,ref:'vehicles',
        default:null
    },
    trip_distance:{
        type: String,
        default: null
    },
    trip_from:{
        type:{
            lat: { type: Number, required: true },
            log: { type: Number, required: true },
            address: { type: String, default: "" }

        },
    },
    trip_to:{
        type:{
            lat: { type: Number, required: true },
            log: { type: Number, required: true },
            address: { type: String, default: "" }
        }
    },
    trip_id:{
        type:String,
    },
    cancellation_reason: {
        type:String,
        default:''
    },
    send_request_date_time:{
        type:Date,
        default: null
    },
    pickup_date_time:{
        type:Date,
        default:Date.now
    },
    pickup_timezone: {
        type: String,
        required: true,
        // examples: "Europe/Amsterdam", "Asia/Kolkata"
    },

    // we are not using this key for passagner
    passenger_detail:{
        type:[
            {
                name:{
                    type:String,
                    default:''
                },
                phone:{
                    type:String,
                    default:'0'
                },
                email:{
                    type:String,
                    default:''
                },
                address:{
                    type:String,
                    default:''
                }
            }
        ],
        default:[]
    },
    passengerCount:{
        type:Number,
        default:1
    },
    customerDetails:{
        type:{
            name: {
                type:String,
            },
            countryName: {
                type:String,
            },
            countryCode: {
                type:String,
            },
            phone: {
                type:String,
            },
            email: {
                type:String,
            },
            address: {
                type:String,
            },
            childSeat: {
                type:String,
            },
            luggage: {
                type:String,
            },
            flightNumber: {
                type:String,
            },
            hotelRoomNumber: {
                type:String,
            },
            language: {
                type:String,
            },
        }
    },
    created_by:{
        type:mongoose.Schema.Types.ObjectId,ref:'user',
    },
    created_by_company_id: {
        type:mongoose.Schema.Types.ObjectId,ref:'user',
    },
    created_by_accessed_driver_id: { // If driver has company's account to create  , update and delete access
        type:mongoose.Schema.Types.ObjectId,ref:'driver', 
    },
    hotel_id: { // If hotel added in the trip User_id of agencies collection
        type:mongoose.Schema.Types.ObjectId,ref:'agency', 
        default: null,
    },

    is_deleted:{
        type:Boolean,
        default:false
    },
    status:{
        type:Boolean,
        default:true
    },
    trip_status:{
        type:String,
        enum: TRIP_STATUS_ENUM,
        default:CONSTANT.TRIP_STATUS.PENDING
    },
    trip_cancelled_by_role: {
        type: String,
        enum: [...TRIP_CANCELLED_BY_ROLE_ENUM, null],
        default: null
    },
    trip_cancelled_user_name: {
        type: String,
        default: null
    },
    cancelled_at: {
        type: Date ,
        default: null,
    },
    
    trip_cancelled_by: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: "trip_cancelled_by_ref", // dynamic ref based on role
        default: null
    },
    
    // This tells Mongoose which collection to look at
    trip_cancelled_by_ref: {
        type: String,
        enum: ["driver", "user" , null],
        default: null
    },
    stripe_payment: {
        payment_intent_id: {
            type: String,
            default: null,
        },
        payment_status: {
            type: String,
            enum: ['Pending', 'Paid', 'Failed'],
            default: 'Pending',
        },
    },
    is_paid:{
        type: Boolean,
        default: false,
    },
    payment_completed_date:{
        type: Date ,
        default: null,
    },
    payment_collcted:{
        type:String,
        enum: PAYMENT_COLLECT_ENUM,
        default: CONSTANT.PAYMENT_COLLECTION_TYPE.PENDING,
    },
    payment_updated_by_admin:{ // only admin can manually update the payment status
        type:mongoose.Schema.Types.ObjectId,ref:'user', 
        default: null,
    },

    is_company_paid: {
        type: Boolean,
        default: false,
    },
    currency: {
        type: String,
        enum: ["eur", "usd", "inr", "gbp"],
        default: `eur`
    },
    charge: {
        id: {
            type: String,
            default: null,
        },
        balance_transaction: {
            type: String,
            default: null,
        },
        amount: {
            type: Number, // better as Number instead of String
            default: null,
        },
        currency: {
            type: String,
            default: null,
        },
    },
    transfer: {
        id: { // transfer id will save when payment will move from stripe account to connected account
            type: String,
            default: null, // Stripe transfer.id → tr_...
        },
        amount: {
            type: Number,
            default: null, // in cents
        },
        currency: {
            type: String,
            default: null,
        },
        destination: {
            type: String,
            default: null, // acct_... (connected account)
        },
        transfer_group: {
            type: String,
            default: null, // usually tripId
        },
        balance_transaction: { // //That typically refers to the balance transaction object (balance_transaction) that gets created whenever you make a transfer to a connected account.
            type: String,
            default: null, // txn_...
        },
        created: {
            type: Date,
            default: null, // timestamp
        },
        destination_payment: {
            type: String,
            default: null, // optional: payment ID created in destination acct
        },
        reversals: {
            type: Array,
            default: [], // optional: track reversals if any
        },
    },

    payout: {
        id: {
            type: String,        // Stripe payout ID → po_…
            default: null,
        },
        amount: {
            type: Number,        // in cents
            default: null,
        },
        currency: {
            type: String,
            default: null,
        },
        status: {
            type: String,
            enum: PAYOUT_TANSFER_ENUM,
            default: CONSTANT.PAYOUT_TANSFER_STATUS.NOT_INITIATED,
        },
        arrival_date: {
            type: Date,          // Stripe gives unix ts → convert to JS Date
            default: null,
        },
        balance_transaction: {
            type: String,        // txn_…
            default: null,
        },
        method: {
            type: String,        // standard | instant
            default: 'standard',
        },
        destination: {
            type: String,        // ba_… (bank) or card_…
            default: null,
        },
        statement_descriptor: {
            type: String,
            default: null,
        },
        created: {
            type: Date,          // unix ts → JS Date
            default: null,
        },
        failure_code: {
            type: String,
            default: null,
        },
        failure_message: {
            type: String,
            default: null,
        },
        initiated_date: {
            type: Date,
            default: null
        },
        completed_date: {
            type: Date,
            default: null,
        }
    },
    
    company_trip_payout_status: { //  when payemt will be transafered from connected account to company bank acccount (Afetr transfer from paypal to connected account)
        type: String,
        enum: PAYOUT_TANSFER_ENUM,
        default: CONSTANT.PAYOUT_TANSFER_STATUS.NOT_INITIATED,
    },
    fifteenMinuteNotification:{
        type: Boolean,
        default: false,
    },

    customerPreNotificationSent: {
        type: Boolean,
        default: false,
    },

    hosted_invoice_url:{
        type:String,
        default: ""
    },
    invoice_pdf:{
        type:String,
        default: ""
    },
    company_hosted_invoice_url:{
        type:String,
        default: ""
    },
    company_invoice_pdf:{
        type:String,
        default: ""
    },
    susbscriptionPlanName:{
        type:String,
        default: ""
    },
    susbscriptionId:{
        type:mongoose.Schema.Types.ObjectId,ref:'subscriptions', 
        default: null,
    },
    susbscriptionPlanId:{
        type:mongoose.Schema.Types.ObjectId,ref:'plans', 
        default: null,
    },
    under_cancellation_review: {
        type: Boolean,
        default: false
    },
    trip_cancellation_request_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'trip_cancellation_requests',
        default: null,
    },

},{timestamps:true})

/**
 * =========================
 * ✅ PRODUCTION INDEXES
 * =========================
 * Keep indexes minimal + high impact.
 * Order matters (MongoDB uses left-to-right).
 */

// 1) Main driver trips (current/booked/reached/active + sorting)
trip.index({
  driver_name: 1,
  trip_status: 1,
  is_deleted: 1,
  status: 1,
  pickup_date_time: -1,
});

// 2) Unpaid completed / payment-related queries (only if you query these often)
trip.index({
  driver_name: 1,
  trip_status: 1,
  is_paid: 1,
  pickup_date_time: -1,
});

trip.index({
  created_by_company_id: 1,
  trip_status: 1,
  under_cancellation_review: 1,
  is_deleted: 1,
  status: 1,
  pickup_date_time: 1,
});

// 3) Company/hotel list views (optional but common in dispatch dashboards)
trip.index({ created_by_company_id: 1, pickup_date_time: -1 });
trip.index({ hotel_id: 1, pickup_date_time: -1 });

// AUTO GENERATE UNIQUE 8-CHAR CODE
trip.pre("save", async function (next) {
    if (this.unique_trip_code) return next();

    let code;
    let exists = true;

    while (exists) {
        code = nanoid(12);
        exists = await this.constructor.exists({ unique_trip_code: code });
        if (!exists) {
            this.unique_trip_code = code;
            break;
        }
    }

    next();
});

module.exports = mongoose.model('trip',trip)