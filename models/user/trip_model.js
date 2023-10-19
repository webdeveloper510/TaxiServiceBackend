const mongoose = require('mongoose')
const Schema = mongoose.Schema

const trip = new Schema({
    driver_name:{
        type:mongoose.Schema.Types.ObjectId,ref:'drivers',
        default:''
    },
    vehicle:{
        type:mongoose.Schema.Types.ObjectId,ref:'vehicles',
        default:''
    },
    trip_from:{
        type:{},
        default:{}
    },
    trip_to:{
        type:{},
        default:{}
    },
    pickup_date_time:{
        type:Date,
        default:Date.now()
    },
    passenger_detail:{
        type:[
            {
                name:{
                    type:String,
                    default:''
                },
                phone:{
                    type:String,
                    default:'0'
                },
                email:{
                    type:String,
                    default:''
                },
                address:{
                    type:String,
                    default:''
                }
            }
        ],
        default:[]
    },
    created_by:{
        type:mongoose.Schema.Types.ObjectId,ref:'users',
    }
},{timestamps:true})

module.exports = mongoose.model('trip',trip)