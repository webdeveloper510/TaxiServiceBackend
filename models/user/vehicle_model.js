const mongoose = require('mongoose')
const Schema = mongoose.Schema
const CONSTANT = require("../../config/constant");
const VEHICLE_UPDATE_STATUS_ENUM = Object.values(CONSTANT.VEHICLE_UPDATE_STATUS);

const vehicle = new Schema({
    vehicle_number:{
        type:String,
        default:''
    },
    vehicle_type:{
        type:String,
        default:''
    },
    vehicle_model:{
        type:String,
        default:''
    },
    vehicle_make:{
        type:String,
        default:'Other'
    },
    AC:{
        type:Boolean,
        default:false
    },
    seating_capacity:{
        type:Number,
        default:0
    },
    price_per_km:{
        type:Number,
        default:0
    },
    minimum_fare:{
        type:Number,
        default:0
    },
    commision:{
        type:Number,
        default:0
    },
    cancelation_time_limit:{
        type:Number,
        default:0
    },
    cancelation_charges:{
        type:Number,
        default:0
    },
    insurance_renewal_date:{
        type:Date,
        default:Date.now()
    },

    // final approved photos
    vehicle_photo:{
        type:String,
        default:''
    },
    vehicle_documents:{
        type:String,
        default:''
    },
    registration_doc_front: { 
        type: String, 
        default: '' 
    },
    registration_doc_back: { 
        type: String, 
        default: '' 
    },
    insurance_doc_front: { 
        type: String, 
        default: '' 
    },
    insurance_doc_back: { 
        type: String, 
        default: '' 
    },

    // this is driver id that will match from driver model
    agency_user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "driver",
    },
    status:{
        type:Boolean,
        default:true
    },
    is_available:{
        type:Boolean,
        default:true
    },
    is_deleted:{
        type:Boolean,
        default:false
    },
    created_by:{
        type:String,
        default:''
    },
    deleted_by:{
        type:String,
        default:''
    },

    // 🔹 verification state
    verification_status: {
      type: String,
      enum: VEHICLE_UPDATE_STATUS_ENUM,
      default: CONSTANT.VEHICLE_UPDATE_STATUS.PENDING,
      index: true,
    },
    verification_comment: {
      type: String,
      default: '',
    },
    last_verified_at: {
      type: Date,
      default: null,
    },

    ever_approved: {
      type: Boolean,
      default: false,
      index: true,
    },

    // Last admin decision on this vehicle (CREATE or UPDATE)
    last_admin_status: {
      type: String,
      enum: VEHICLE_UPDATE_STATUS_ENUM,
      default: CONSTANT.VEHICLE_UPDATE_STATUS.NONE,
    },
    last_admin_comment: {
      type: String,
      default: '',
    },

    // 🔹 update request flag
    has_pending_update: {
      type: Boolean,
      default: false,
      index: true,
    },

    // 🔹 link to the exact pending request (UPDATE or CREATE)
    pending_request_id: {
      type: Schema.Types.ObjectId,
      ref: 'vehicle_update_request',
      default: null,
      index: true,
    },
},{timestamps:true})

module.exports = mongoose.model('vehicle',vehicle)