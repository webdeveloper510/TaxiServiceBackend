const mongoose = require('mongoose')
const Schema = mongoose.Schema

const prices = new Schema({
    user_id:{
        type:mongoose.Schema.Types.ObjectId,ref:'users',
        default:null
    },
    departure_place:{
        type:String,
        default:''
    },
    arrival_place:{
        type:String,
        default:'0'
    },
    number_of_person:{
        type:Number,
        default:1
    },
    amount:{
        type:Number,
        default:1
    },
    vehicle_type:{
        type:String,
        default:'0'
    },
    visible_to_hotel:{
        type:Boolean,
        default:false
    },
    status:{
        type:Boolean,
        default:true
    },
},{timestamps:true})

module.exports = mongoose.model('prices',prices)