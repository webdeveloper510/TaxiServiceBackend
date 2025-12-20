const mongoose = require("mongoose");
const { Schema } = mongoose;
const CONSTANT = require("../../config/constant");
const DOC_STATUS_ENUM = Object.values(CONSTANT.DOC_STATUS);
const DRIVER_DOC_TYPE_ENUM = Object.values(CONSTANT.DRIVER_DOC_TYPE);
const DRIVER_VERIFICATION_STATUS_ENUM = Object.values(CONSTANT.DRIVER_VERIFICATION_STATUS);

// ======================= SUB SCHEMAS =======================

// ----------------- Reminder event (audit) -----------------
const expiryReminderSchema = new Schema(
  {
    daysBefore: { type: Number, required: true }, // 30 / 15 / 5
    channel: { type: String, enum: ["EMAIL", "PUSH", "SMS"], required: true },
    sentAt: { type: Date, required: true },

    provider: { type: String, default: "" }, // e.g. "SENDGRID"
    messageId: { type: String, default: "" }, // provider message id

    status: { type: String, enum: ["SENT", "FAILED"], default: "SENT" },
    failReason: { type: String, default: "" },
  },
  { _id: false }
);

// Store all previous uploads (audit)
const documentVersionSchema = new Schema(
  {
    revision: { type: Number, required: true },

    files: { type: [String], default: [] },
    mimeTypes: { type: [String], default: [] },

    statusAtThatTime: {
      type: String,
      enum: DOC_STATUS_ENUM,
      required: true,
    },
    expirationDate: { type: Date, default: null },
    submittedAt: { type: Date, default: Date.now },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "users", default: null },

    rejectReasonKey: { type: String, default: "" },
    rejectReasonText: { type: String, default: "" },
  },
  { _id: false }
);

// Current document state
const driverDocumentSchema = new Schema(
  {
    type: {
      type: String,
      enum: DRIVER_DOC_TYPE_ENUM,
      required: true,
    },

    // current active file(s)
    files: { type: [String], default: [] },
    mimeTypes: { type: [String], default: [] },

    status: {
      type: String,
      enum: DOC_STATUS_ENUM,
      default: CONSTANT.DOC_STATUS.NOT_UPLOADED,
      index: true,
    },
    expirationDate: { type: Date, default: null },
    submittedAt: { type: Date, default: null },

    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "users", default: null },

    rejectReasonKey: { type: String, default: "" },
    rejectReasonText: { type: String, default: "" },

    revision: { type: Number, default: 0 },

    // history of old uploads
    versions: { type: [documentVersionSchema], default: [] },

    // reminders history
    expiryReminders: { type: [expiryReminderSchema], default: [] },
    lastExpiryReminderAt: { type: Date, default: null },
    lastExpiryReminderDaysBefore: { type: Number, default: null },
  },
  { _id: false }
);

// Whole block that will be embedded in Driver model
const driverDocumentsBlockSchema = new Schema(
  {
    documents: {
      type: [driverDocumentSchema],
      default: [
        { type: CONSTANT.DRIVER_DOC_TYPE.PROFILE_PHOTO },
        { type: CONSTANT.DRIVER_DOC_TYPE.KVK_KIWA },
        { type: CONSTANT.DRIVER_DOC_TYPE.CHAUFFEUR_CARD },
        { type: CONSTANT.DRIVER_DOC_TYPE.DRIVER_LICENSE },
      ],
    },

    verification: {
      status: {
        type: String,
        enum: DRIVER_VERIFICATION_STATUS_ENUM,
        default: CONSTANT.DRIVER_VERIFICATION_STATUS.NOT_SUBMITTED,
        index: true,
      },
      isVerified: { type: Boolean, default: false, index: true },
      lastSubmittedAt: { type: Date, default: null },
      lastReviewedAt: { type: Date, default: null },
      lastReviewedBy: { type: Schema.Types.ObjectId, ref: "users", default: null },
    },
  },
  { _id: false }
);

module.exports = {
  driverDocumentSchema,
  driverDocumentsBlockSchema,
};
