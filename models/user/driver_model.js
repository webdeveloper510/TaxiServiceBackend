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
    address_1: {
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
        default: ''
    },
    phone: {
        type: String,
        default: ''
    },
    password: {
        type: String,
        default: ''
    },
    profile_image: {
        type: String,
        default: ''
    },
    driver_documents: {
        type: String,
        default: ''
    },
    gender: {
        type: String,
        default: ''
    },
    is_available: {
        type: Boolean,
        default: false
    },
    is_deleted: {
        type: Boolean,
        default: false
    },
    agency_user_id: {
        type: mongoose.Schema.Types.ObjectId,ref:'users',
    },
    deleted_by: {
        type: mongoose.Schema.Types.ObjectId,ref:'users',
    },
    status: {
        type: Boolean,
        default: true
    },
    driver_status:{
        type:String,
        enum : ['Active','Inactive'],
    },
    created_by: {
        type: mongoose.Schema.Types.ObjectId,ref:'users',
    }
}, { timestamps: true })

module.exports = mongoose.model('driver', driver)