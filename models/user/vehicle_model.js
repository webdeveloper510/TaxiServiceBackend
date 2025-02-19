const mongoose = require('mongoose')
const Schema = mongoose.Schema

const vehicle = new Schema({
    vehicle_number:{
        type:String,
        default:''
    },
    vehicle_type:{
        type:String,
        default:''
    },
    vehicle_model:{
        type:String,
        default:''
    },
    vehicle_make:{
        type:String,
        default:'Other'
    },
    AC:{
        type:Boolean,
        default:false
    },
    seating_capacity:{
        type:Number,
        default:0
    },
    price_per_km:{
        type:Number,
        default:0
    },
    minimum_fare:{
        type:Number,
        default:0
    },
    commision:{
        type:Number,
        default:0
    },
    cancelation_time_limit:{
        type:Number,
        default:0
    },
    cancelation_charges:{
        type:Number,
        default:0
    },
    insurance_renewal_date:{
        type:Date,
        default:Date.now()
    },
    vehicle_photo:{
        type:String,
        default:''
    },
    vehicle_documents:{
        type:String,
        default:''
    },
    agency_user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "driver",
    },
    status:{
        type:Boolean,
        default:true
    },
    is_available:{
        type:Boolean,
        default:true
    },
    is_deleted:{
        type:Boolean,
        default:false
    },
    created_by:{
        type:String,
        default:''
    },
    deleted_by:{
        type:String,
        default:''
    }
},{timestamps:true})

module.exports = mongoose.model('vehicle',vehicle)