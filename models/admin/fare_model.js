const mongoose = require('mongoose')
const Schema = mongoose.Schema

const fare = new Schema({
    vehicle_type_id:{
        type:String,
        default:null
    },
    fare_per_km:{
        type:Number,
        default:0
    },
    minimum_fare:{
        type:Number,
        default:0
    },
    minimum_distance:{
        type:Number,
        default:0
    },
    waiting_fare:{
        type:Number,
        default:0
    },
    status:{
        type:Boolean,
        default:true
    },
    is_deleted:{
        type:Boolean,
        default:false
    },
    deleted_by:{
        type:String,
        default:null
    }
},{timestamps:true})

module.exports = mongoose.model('fare',fare)