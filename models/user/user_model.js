const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const user = new Schema(
  {
    first_name: {
      type: String,
      default: "",
    },
    last_name: {
      type: String,
      default: "",
    },
    email: {
      type: String,
      default: "",
    },
    phone: {
      type: String,
      default: "",
    },
    password: {
      type: String,
      default: "",
    },
    profile_image: {
      type: String,
      default: "",
    },
    role: {
      type: String,
      enum: ["SUPER_ADMIN", "COMPANY", "HOTEL"],
      default: "HOTEL",
    },
    is_deleted: {
      type: Boolean,
      default: false,
    },
    deleted_by_id: {
      type: String,
      default: "",
    },
    background_color: {
      type: String,
      default: "#fff",
    },
    logo: {
      type: String,
      default:
        "https://res.cloudinary.com/dtkn5djt5/image/upload/v1701238196/jhw4vir6bftgfzim93qw.avif",
    },
    OTP: {
      type: String,
      default: "",
    },
    otp_expiry: {
      type: Date,
    },
    is_email_verified: {
      type: Boolean,
      default: false,
    },
    is_phone_verified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: Boolean,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "users",
      default: "",
    },
    
  },
  { timestamps: true }
);

module.exports = mongoose.model("user", user);
