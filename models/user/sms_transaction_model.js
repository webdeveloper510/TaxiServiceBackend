const CONSTANT = require("../../config/constant");
const SMS_EVENTS = Object.values(CONSTANT.SMS_EVENTS)
const SMS_STATUS = Object.values(CONSTANT.SMS_STATUS)
  const mongoose = require('mongoose')
  const Schema = mongoose.Schema
  
  // Only for Super admin and admins use
  const sms_transactions = new Schema({
    user_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'users',
        required: true
    },
    trip_id: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'trip', 
        required: false 
    }, // if SMS is related to a trip
    trip_no:{ 
        type: String, 
        required: true 
    },
    phone: { 
        type: String, 
        required: true 
    },
    message_type:{
            type:String,
            enum: SMS_EVENTS,
            default: CONSTANT.SMS_EVENTS.TRIP_CREATE,
    },
    description: { 
        type: String, 
        required: true
    },
    cost_in_cents: { 
        type: Number, 
        default: 10 
    }, // 15 cents per SMS
    status: { 
        type: String, 
        enum: SMS_STATUS, 
        default: CONSTANT.SMS_STATUS.SENT 
    },
    sent_at: { 
        type: Date, 
        default: Date.now 
    }
  
  },{timestamps:true})
  
  module.exports = mongoose.model('smsTransactions',sms_transactions)