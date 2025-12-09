const mongoose = require("mongoose");
const Schema = mongoose.Schema;
const CONSTANT = require("../../config/constant");

// Who is giving the rating (you can add more later if needed)
const RATED_BY_ROLE_ENUM = ["CUSTOMER", "COMPANY", "HOTEL", "ADMIN"];

const tripRatingSchema = new Schema(
  {
    trip_id: {
      type: Schema.Types.ObjectId,
      ref: "trip",
      required: true,
      index: true,
    },

    driver_id: {
      type: Schema.Types.ObjectId,
      ref: "driver",
      required: true,
      index: true,
    },

    // Who gave this rating? (customer / company / hotel / admin)
    rated_by_role: {
      type: String,
      enum: [CONSTANT.ROLES.CUSTOMER],
      default: CONSTANT.ROLES.CUSTOMER,
    },

    // If rater exists in DB (customer user, company user, hotel, etc.)
    // rated_by: {
    //   type: Schema.Types.ObjectId,
    //   refPath: "rated_by_ref",
    //   default: null,
    // },

    // Dynamic reference collection for rated_by
    // rated_by_ref: {
    //   type: String,
    //   enum: ["user", "agency", "driver", null], // adjust as per your models
    //   default: null,
    // },

    // Actual rating 1–5
    rating: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
    },

    // Optional short title like "Great ride"
    // title: {
    //   type: String,
    //   default: "",
    //   trim: true,
    // },

    // Detailed feedback / comment from customer
    comment: {
      type: String,
      default: "",
      trim: true,
    },

    // Optional tags like ["Clean car", "Polite", "Late"]
    // tags: {
    //   type: [String],
    //   default: [],
    // },

    // Snapshots (useful if you want to show old name even if driver later changes name)
    // driver_name_snapshot: {
    //   type: String,
    //   default: "",
    // },
    
    // customer_name_snapshot: {
    //   type: String,
    //   default: "",
    // },

    // Soft delete + status
    is_deleted: {
      type: Boolean,
      default: false,
    },
    // status: {
    //   type: Boolean,
    //   default: true,
    // },
  },
  { timestamps: true }
);

/**
 * Indexes
 */

// One rating per (trip, driver, rater)
tripRatingSchema.index(
  {
    trip_id: 1,
    driver_id: 1,
    // rated_by: 1,
    // rated_by_role: 1,
  },
//   {
//     unique: true,
//     partialFilterExpression: {
//       is_deleted: false,
//     },
//   }
);

// For listing ratings for a driver (latest first)
tripRatingSchema.index({ driver_id: 1, createdAt: -1 });

// For listing ratings per trip
tripRatingSchema.index({ trip_id: 1, createdAt: -1 });

module.exports = mongoose.model("trip_rating", tripRatingSchema);
