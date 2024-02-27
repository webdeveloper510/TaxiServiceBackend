const mongoose = require('mongoose')
const Schema = mongoose.Schema

const driver = new Schema({
    first_name: {
        type: String,
        default: ''
    },
    last_name: {
        type: String,
        default: ''
    },
    bankNumber: {
        type: String,
        default: ''
    },
    companyName: {
        type: String,
        default: ''
    },
    kvk: {
        type: String,
        default: ''
    },
    address_2: {
        type: String,
        default: ''
    },
    city: {
        type: String,
        default: ''
    },
    country: {
        type: String,
        default: ''
    },
    zip_code: {
        type: String,
        default: ''
    },
    email: {
        type: String,
        default: '',
        index: true
    },
    phone: {
        type: String,
        default: '',
        index: true
    },
    password: {
        type: String,
        default: ''
    },
    profile_image: {
        type: String,
        default: 'https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg'
    },
    driver_documents: {
        type: String,
        default: ''
    },
    OTP: {
        type: String,
        default: 'a0'
    },
    gender: {
        type: String,
        default: ''
    },
    jwtToken: {
        type: String,
        default: ''
    },
    is_available: {
        type: Boolean,
        default: true
    },
    is_deleted: {
        type: Boolean,
        default: false
    },
    agency_user_id: {
        type: mongoose.Schema.Types.ObjectId, ref: 'users',
    },
    deleted_by: {
        type: mongoose.Schema.Types.ObjectId, ref: 'users',
    },
    status: {
        type: Boolean,
        default: true
    },
    auto_accept: {
        type: Boolean,
        default: false
    },
    driver_status: {
        type: String,
        enum: ['Active', 'Inactive'],
    },
    created_by: {
        type: mongoose.Schema.Types.ObjectId, ref: 'user',
    },
    isVerified: {
        type: Boolean,
        default: false,
    },
    isBlocked: {
        type: Boolean,
        default: false,
    },
    isDocUploaded: {
        type: Boolean,
        default: false
    },
    location: {
        type: {
            type: String,
            enum: ["Point"],
            default: "Point",
            require: true,
        },
        coordinates: {
            type: [Number],
            default: [null, null],
        },
    },
    is_login:{
        type:Boolean,
        default:false
    },
    locationUpdatedAt: {
        type: Date,
        default: Date.now,
    },
    isSocketConnected: {
        type: Boolean,
        default: false,
    },
    socketId: {
        type: String,
        default: null,
    },
    currentTrip:{ type: Schema.Types.ObjectId, ref: 'trip', default: null},
    defaultVehicle:{ type: Schema.Types.ObjectId, ref: 'vehicle', default: null}
}, { timestamps: true })

module.exports = mongoose.model('driver', driver)