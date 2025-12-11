const mongoose = require('mongoose')
const Schema = mongoose.Schema
const CONSTANT = require("../../config/constant");
const VEHICLE_UPDATE_STATUS_ENUM = Object.values(CONSTANT.VEHICLE_UPDATE_STATUS);
const VEHICLE_UPDATE_ACTION_ENUM = Object.values(CONSTANT.VEHICLE_UPDATE_ACTION);

const vehicleUpdateRequestSchema = new Schema({

    vehicle_id: {
      type: Schema.Types.ObjectId,
      ref: 'vehicle',
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: Object.values(VEHICLE_UPDATE_ACTION_ENUM),
      required: true,
    },
    driver_id: {
      type: Schema.Types.ObjectId,
      ref: 'driver',
      required: true,
      index: true,
    },

    // what driver wants
    requested_data: {
      vehicle_number: String,
      vehicle_type: String,
      vehicle_model: String,
      vehicle_make: String,
      vehicle_make_year: Number,
      AC: Boolean,
      seating_capacity: Number,
      insurance_renewal_date: Date,

      vehicle_photo: String,
      registration_doc_front: String,
      registration_doc_back: String,
      insurance_doc_front: String,
      insurance_doc_back: String,
    },

    // snapshot of current approved values
    current_data: {
      vehicle_number: String,
      vehicle_type: String,
      vehicle_model: String,
      vehicle_make: String,
      vehicle_make_year: Number,
      AC: Boolean,
      seating_capacity: Number,
      insurance_renewal_date: Date,

      vehicle_photo: String,
      registration_doc_front: String,
      registration_doc_back: String,
      insurance_doc_front: String,
      insurance_doc_back: String,
    },

    status: {
      type: String,
      enum: VEHICLE_UPDATE_STATUS_ENUM,
      default: CONSTANT.VEHICLE_UPDATE_STATUS.PENDING,
      index: true,
    },

    verification_comment: {
      type: String,
      default: '',
      trim: true,
    },
    reviewed_by: {
      type: Schema.Types.ObjectId,
      ref: 'user',
      default: null,
    },
    reviewed_at: {
      type: Date,
      default: null,
    },
},{timestamps:true});

module.exports = mongoose.model('vehicle_update_request',vehicleUpdateRequestSchema)