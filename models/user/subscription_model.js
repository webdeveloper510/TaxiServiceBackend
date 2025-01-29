const mongoose = require('mongoose')
const Schema = mongoose.Schema

const subscriptions = new Schema({
    subscriptionId:{
        type:String,
        default:''
    },
    planId:{
        type:String,
        default:''
    },
    customerId:{
        type:String,
        default:''
    },
    productPriceId:{
        type:String,
        default:''
    },
    chargeId:{
        type:String,
        default:''
    },
    paymentIntentId:{
        type:String,
        default:''
    },
    invoiceId:{
        type:String,
        default:''
    },
    invoiceUrl:{
        type:String,
        default:''
    },
    billing_reason:{
        type:String,
        default:''
    },
    cancelReason:{
        type:String,
        default:''
    },
    invoiceName:{
        type:String,
        default:''
    },
    invoicePdfUrl:{
        type:String,
        default:''
    },
    active:{
        type:Boolean,
        default:true
    },
    role: {
        type:String,
        default:''
    },
    startPeriod: {
        type:Date,
        default:Date.now()
    },
    endPeriod: {
        type:Date,
        default:Date.now()
    },
    purchaseByCompanyId:{
        type:mongoose.Schema.Types.ObjectId,ref:'user',
        default: null
    },
    purchaseByDriverId:{
        type:mongoose.Schema.Types.ObjectId,ref:'driver',
        default: null
    },
    purchaseBy:{
        type: String,
        default:''
    },
    active:{
        type:Boolean,
        default:false
    },
    isRefund:{
        type:Boolean,
        default:false
    },
    amount: {
        type: Number,
        default: 0
    },
    paid: {
        type:Boolean,
        default:false
    },
    is_deleted:{
        type:Boolean,
        default:false
    },
},{timestamps:true})

module.exports = mongoose.model('subscriptions',subscriptions)