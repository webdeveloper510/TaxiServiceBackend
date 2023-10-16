const mongoose = require('mongoose')
const Schema = mongoose.Schema

const booking = new Schema({
    location_from:{
        type: String,
        default:''
    },
    location_to:{
        type :String ,
        default:''
    },
    date_time:{
        type:Date,
        default:Date.now()
    },
    location_from_start_time:{
        type: Date,
        default:Date.now()
    },
    payment_type:{
        type:String,
        default:''
    },
    amount:{
        type:Number,
        default:0
    },
    payment_response:{
        type:Object,
        default:{}
    },
    status:{
        type:Boolean,
        default:true
    },
    is_cancelled:{
        type:Boolean,
        default:false
    },
    booking_information_comment:{
        type:String,
        default:''
    },
    created_by:{
        type:String,
        default:''
    },
    is_deleted:{
        type:Boolean,
        default: false
    },
    deleted_by:{
        type:String,
        default:''
    }
},{timestamps:true})

module.exports = mongoose.model('booking',booking)