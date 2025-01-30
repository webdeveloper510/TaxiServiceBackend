const mongoose = require('mongoose')
const Schema = mongoose.Schema

const bankAccountDetails = new Schema({
    placeHolderName:{
        type:String,
        required: true,
        default:''
    },
    ibnNumber: {
        type: String,
        required: true,
        default: ''
    },
    externalAccountId: {
        type: String,
        required: true,
        default: ''
    },
    isDelete: {
        type: String,
        required: true,
        default: ''
    },
    role: {
        type: String,
        required: true,
        default: ''
    },
    userId:{
            type:mongoose.Schema.Types.ObjectId,ref:'user',
            default: null
    },
    driverId:{
        type:mongoose.Schema.Types.ObjectId,ref:'driver',
        default: null
    },
    ownerId:{
        type: String,
        default:''
    },

},{timestamps:true})

module.exports = mongoose.model('bankAccountDetails',bankAccountDetails)