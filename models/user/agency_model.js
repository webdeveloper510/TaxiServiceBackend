const mongoose = require('mongoose')
const Schema = mongoose.Schema

const agency = new Schema ({
    user_id:{
        type: String,
        default:''
    },
    land:{
        type:String,
        default:''
    },
    post_code:{
        type:String,
        default:''
    },
    house_number:{
        type:String,
        default:''
    },
    description:{
        type:String,
        default:''
    },
    affiliated_with:{
        type:String,
        default:''
    },
    p_number:{
        type:String,
        default:''
    },
    number_of_cars:{
        type:String,
        default:''
    },
    chamber_of_commerce_number:{
        type:String,
        default:''
    },
    vat_number:{
        type:String,
        default:''
    },
    website:{
        type:String,
        default:''
    },
    tx_quality_mark:{
        type:String,
        default:''
    },
    saluation:{
        type:String,
        default:''
    },
    location:{
        type:String,
        default:''
    },

},{timestamps:true})

module.exports = mongoose.model('agency',agency)