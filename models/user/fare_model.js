const mongoose = require('mongoose')
const Schema = mongoose.Schema

const fare = new Schema({
    vehicle_type:{
        type:String,
        default:''
    },
    vehicle_fare_per_km:{
        type:String,
        default:'0'
    },
    minimum_fare:{
        type:String,
        default:'0'
    },
    minimum_distance:{
        type:String,
        default:'0'
    },
    waiting_fare:{
        type:String,
        default:'0'
    },
    created_by:{
        type:String,
        default:''
    },
    status:{
        type:Boolean,
        default:true
    },
    is_deleted:{
        type:Boolean,
        default:false
    },
},{timestamps:true})

module.exports = mongoose.model('fare',fare)