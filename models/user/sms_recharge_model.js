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
    price: { 
      type: Number, 
      required: true 
  },
    status: { type: String, enum: SMS_RECHARGE_STATUS, default: CONSTANT.SMS_RECHARGE_STATUS.PENDING },
    checkoutSessionId: { type: String }, // from payment gateway checkout session
    created_at: { type: Date, default: Date.now }
  
  },{timestamps:true})
  
  module.exports = mongoose.model('smsRecharges',sms_recharges)