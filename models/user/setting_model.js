const mongoose = require('mongoose')
const Schema = mongoose.Schema

// Only for Super admin and admins use
const settings = new Schema({
    key:{
        type:String,
        default:''
    },
    value: {
        type: String,
        default: ''
    }
    

},{timestamps:true})

module.exports = mongoose.model('settings',settings)