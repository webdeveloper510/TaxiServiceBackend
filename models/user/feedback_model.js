const mongoose = require('mongoose')
const Schema = mongoose.Schema

const feedback = new Schema({
    comment:{
        type:String,
        default:''
    },
    title:{
        type:String,
        default:''
    },
    user_id:{
        type:mongoose.Schema.Types.ObjectId,ref:'users'
    }
},{timestamps:true})

module.exports = mongoose.model('feedback',feedback)