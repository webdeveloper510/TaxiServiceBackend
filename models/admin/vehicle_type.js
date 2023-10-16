const mongoose = require('mongoose')
const Schema = mongoose.Schema;

const vehicleType = new Schema({
    name:{
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
    }
},{timestamps:true})

module.exports = mongoose.model('vehicleType',vehicleType)