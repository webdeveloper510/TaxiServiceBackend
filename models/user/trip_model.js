const mongoose = require('mongoose')
const Schema = mongoose.Schema

const trip = new Schema({
    driver_name:{
        type:mongoose.Schema.Types.ObjectId,ref:'driver',
        default:null
    },
    vehicle_type:{
        type:String,
        default:''
    },
    commission:{
        type:{
            commission_type:{
                type:String,
            },
            commission_value: {
                type:Number
            }
        },
        default:{
            commission_type:"Percentage",
            commission_value:0
        }
    },
    superAdminPaymentAmount: {
        type: Number,
        require: true,
    },
    companyPaymentAmount: {
        type: Number,
        require: true,
    },
    driverPaymentAmount: {
        type: Number,
        require: true,
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
        enum:['Cash','Hotel Account',"Card", "ON ACCOUNT"]
    },
    price:{
        type:Number,
        default:0
    },
    pickup_time:{
        type:Date,
        default:Date.now()
    },
    drop_time:{
        type:Date,
        default:Date.now()
    },
    amount:{
        type:Object,
    },
    vehicle:{
        type:mongoose.Schema.Types.ObjectId,ref:'vehicles',
        default:null
    },
    trip_from:{
        type:{},
        default:{}
    },
    trip_to:{
        type:{},
        default:{}
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
        default:Date.now()
    },
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
            phone: {
                type:String,
            },
            email: {
                type:String,
            },
            address: {
                type:String,
            }
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
        enum:['Booked','Active','Completed','Pending','Accepted','Canceled',"Reached"],
        default:'Pending'
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
        enum:['MANUALLY','ONLINE'],
        default: 'ONLINE',
    },
    payment_upadted_by_admin:{ // only admin can manually update the payment status
        type:mongoose.Schema.Types.ObjectId,ref:'user', 
        default: null,
    },

    is_company_paid: {
        type: Boolean,
        default: false,
    },
    fifteenMinuteNotification:{
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
},{timestamps:true})

module.exports = mongoose.model('trip',trip)