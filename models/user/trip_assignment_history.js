const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const CONSTANT = require("../../config/constant");
const TRIP_HISTORY_ENUM_STATUS = Object.values(CONSTANT.TRIP_HISTORY_ENUM_STATUS);
const TripAssignmentHistorySchema = new Schema(
  {
    // Which trip this history row belongs to
    trip_id: {
      type: Schema.Types.ObjectId,
      ref: "trip",
      required: true,
      index: true,
    },

    // Driver before this action (can be null)
    from_driver: {
      type: Schema.Types.ObjectId,
      ref: "driver",
      default: null,
    },

    // Driver after this action (can be null)
    to_driver: {
      type: Schema.Types.ObjectId,
      ref: "driver",
      default: null,
    },

    /**
     * What exactly happened:
     * - ASSIGN                → first time trip assigned to a driver
     * - REASSIGN              → trip moved from one driver to another
     * - CANCEL                → trip has been cancelled finally
     * - RETRIEVE              → company removed driver (trip unassigned)
     * - DRIVER_CANCEL_REQUEST → driver requested cancellation (pending review)
     * - CANCEL_APPROVED       → company approved cancellation
     * - CANCEL_REJECTED       → company rejected cancellation
     */
    action: {
      type: String,
      enum: TRIP_HISTORY_ENUM_STATUS,
      required: true,
    },

    /**
     * Who performed this action in business terms
     */
    action_by_role: {
      type: String,
      enum: ["DRIVER", "COMPANY", "CUSTOMER", "SYSTEM"],
      required: true,
    },

    // Actual document that did the action
    action_by: {
      type: Schema.Types.ObjectId,
      refPath: "action_by_ref",
      default: null,
    },

    // Which collection `action_by` points to
    action_by_ref: {
      type: String,
      enum: ["driver", "user", "agency", "system", null],
      default: null,
    },

    // Reason from driver/company/customer (optional)
    reason: {
      type: String,
      default: "",
    },

    // Extra internal notes (optional)
    note: {
      type: String,
      default: "",
    },

    /**
     * For auditing:
     * true  → we notified customer for this event (only first ASSIGN)
     * false → we did not notify customer (REASSIGN / internal actions)
     */
    notify_customer: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true, // createdAt = when this event happened
  }
);

// Helpful index for history by trip
TripAssignmentHistorySchema.index(
  { trip_id: 1, createdAt: 1 },
  { name: "history_by_trip" }
);

module.exports = mongoose.model(
  "trip_assignment_history",
  TripAssignmentHistorySchema
);
