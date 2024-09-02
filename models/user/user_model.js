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
    favoriteDrivers: {
      type: [{ type: Schema.Types.ObjectId, ref: 'driver' }],
      default:[],
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
    commission: {
      type: Number,
      default: true,
    },
    created_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      default: null,
    },
    totalBalance: {
      type: Number,
      default: 0,
    },
    isSocketConnected: {
      type: Boolean,
      default: false,
    },
    socketId: {
        type: String,
        default: null,
    },
    deviceToken: {
      type: String,
      default: ''
  },
    isDriver: {
      type: Boolean,
      default: false
  },
  driverId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "driver",
    default: null,
  },
  jwtToken: {
    type: String,
    default: null,
},
  lastUsedToken: {
    type:Date,
    default:Date.now()
},
jwtTokenMobile: {
  type: String,
  default: null,
},
lastUsedTokenMobile: {
  type:Date,
  default:Date.now()
},
  },
  { timestamps: true }
);

module.exports = mongoose.model("user", user);
