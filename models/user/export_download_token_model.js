const mongoose = require("mongoose");
const CONSTANT = require("../../config/constant");
const ROLES_ENUM = Object.values(CONSTANT.ROLES)

const ExportDownloadTokenSchema = new mongoose.Schema(
  {
    token: { type: String, required: true, unique: true, index: true },

    token_type: {
      type: String,
      required: true,
      enum: ["TRIP_EXPORT", "INVOICE_EXPORT", "DRIVER_EXPORT", "GENERIC_EXPORT"],
      index: true,
    },

    // account_id: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    created_by: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

    role: {
      type: String,
      required: true,
      enum: ROLES_ENUM,
      index: true,
    },

    payload: {
      status: { type: String, default: null },
      format: { type: String, required: true, enum: ["xlsx", "pdf"] },
      filters: { type: mongoose.Schema.Types.Mixed, default: {} },
      fields: { type: [String], default: [] },
    },

    // ✅ Token becomes INVALID after 10 seconds (checked in code)
    expires_at: { type: Date, required: true, index: true },

    // ✅ MongoDB TTL uses this => auto-delete after 1 minute
    cleanup_at: { type: Date, required: true, index: true },

    used_at: { type: Date, default: null, index: true },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false },
    versionKey: false,
  }
);

// ✅ TTL index (Mongo auto delete)
ExportDownloadTokenSchema.index({ cleanup_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("ExportDownloadToken", ExportDownloadTokenSchema);
