const mongoose = require('mongoose')
const Schema = mongoose.Schema

const fare = new Schema({
    car_type:{
        type:String,
        default:''
    },
    car_type_id:{
        type: Schema.Types.ObjectId,
        ref: "cartypes",
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
    price_per_min:{
        type:String,
        default:'0'
    },
    waiting_fare:{
        type:String,
        default:'0'
    },
    created_by:{
        type:mongoose.Schema.Types.ObjectId,ref:'users',
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