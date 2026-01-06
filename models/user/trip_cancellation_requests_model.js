const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const CONSTANT = require("../../config/constant");
const TRIP_STATUS_ENUM = Object.values(CONSTANT.TRIP_STATUS)
const RIP_CANCELLATION_REQUEST_ENUM = Object.values(CONSTANT.TRIP_CANCELLATION_REQUEST_STATUS)
const cancellationRequestSchema = new Schema({
  trip_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'trip',
    required: true
  },
  trip_sequence_id: {
    type: String,
    required: true
  },
  driver_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'driver',
    required: true
  },
  company_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'user', // Assuming company users are stored in 'user' collection
    required: true
  },
  cancellation_reason: {
    type: String,
    default: ''
  },
  trip_status: { // that status when driver wants the cancel trip
    type: String,
    enum: TRIP_STATUS_ENUM,
    default: CONSTANT.TRIP_STATUS.APPROVED
  },
  requested_at: {
    type: Date,
    default: Date.now
  },
  reviewer_action: {
    type: {
      action_taken: {
        type: String,
        enum: RIP_CANCELLATION_REQUEST_ENUM,
        default: CONSTANT.TRIP_CANCELLATION_REQUEST_STATUS.PENDING
      },
      reviewed_by_user: { // company , admin or superadmin will review the request
        type: mongoose.Schema.Types.ObjectId,
        ref: 'user',
        default: null
      },
      reviewed_by_driver_partner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'driver',
        default: null
      },
      reviewed_by_account_access_driver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'driver',
        default: null
      },
      reviewed_at: {
        type: Date,
        default: Date.now
      }
    },
    default: {}
  },

  reviewed_by_role: {
    type: String,
    default: null
  },
 
}, { timestamps: true });

cancellationRequestSchema.index({ requested_at: -1, company_id: 1 });
cancellationRequestSchema.index({ requested_at: -1, trip_id: 1 });
module.exports = mongoose.model('trip_cancellation_requests', cancellationRequestSchema , 'trip_cancellation_requests');
