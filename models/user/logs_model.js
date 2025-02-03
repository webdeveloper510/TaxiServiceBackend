const mongoose = require('mongoose')
const Schema = mongoose.Schema

const logs = new Schema({
    api_name:{
        type:String,
        default:''
    },
    payload: {
        type: String,
        default: ''
    },
    api_param: {
        type: String,
        default: ''
    },
    error_message: {
        type: String,
        default: null
    },
    user_id: {
        type: String,
        default: ''
    },
    role:{
        type: String,
        default: ''
    },
    error_response: {
        type: String,
        default:''
    }

},{timestamps:true})

module.exports = mongoose.model('logs',logs)