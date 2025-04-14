const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const plans = new Schema({
    planId:{
        type:String,
        required: true,
        default:''
    },
    name:{
        type:String,
        required: true,
        default:''
    },
    status:{
        type:Boolean,
        required: true,
        default:true
    },
    price:{
        type:Number,
        required: true,
        default:0.0
    },
    productPriceId:{
        type:String,
        required: true,
        default:''
    },
    description: {
        type:String,
        required: false,
    },
    forRoles: {
        type:String,
        required: false,
        default: 'DRIVER'
    },
    features:{
        type:[ ]
    }
},{timestamps:true})

module.exports = mongoose.model('plans',plans)