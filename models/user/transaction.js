const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const transaction = new Schema(
  {
    to: {
      type: mongoose.ObjectId,
      require: true,
      ref: "user"
    },
    amount: {
      type: Number,
      require: true,
    },
    type: {
      type: String,
      enum: ["credit", "debit"],
      require: true,
    },
    from: {
      type: mongoose.ObjectId,
      ref: 'driver',
      require: true,
    },
    fromType: {
      type: String,
      enum: ["SUPER_ADMIN", "DRIVER"],
      default: "DRIVER",
    },
    trip:{
      type: mongoose.ObjectId,
      ref: 'trip',
      default: null
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("transaction", transaction);
