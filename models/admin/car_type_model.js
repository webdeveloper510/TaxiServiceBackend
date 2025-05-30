const mongoose = require('mongoose')
const Schema = mongoose.Schema

const cartypes = new Schema({
    name:{
        type:String,
        default:null,
        require: true,
    },
    passangerLimit: {
        type:Number,
        default:4,
        require: true,
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

module.exports = mongoose.model('cartypes',cartypes)