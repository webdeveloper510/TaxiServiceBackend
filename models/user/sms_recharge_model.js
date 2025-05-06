const CONSTANT = require("../../config/constant");
const SMS_RECHARGE_STATUS = Object.values(CONSTANT.SMS_RECHARGE_STATUS)
  const mongoose = require('mongoose')
  const Schema = mongoose.Schema
  
  // Only for Super admin and admins use
  const sms_recharges = new Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'users',
        required: true
    },
    payment_method: { 
        type: String, 
        required: true 
    },
    status: { type: String, enum: SMS_RECHARGE_STATUS, default: CONSTANT.SMS_RECHARGE_STATUS.PENDING },
    transaction_id: { type: String }, // from payment gateway
    created_at: { type: Date, default: Date.now }
  
  },{timestamps:true})
  
  module.exports = mongoose.model('sms_transactions',sms_recharges)