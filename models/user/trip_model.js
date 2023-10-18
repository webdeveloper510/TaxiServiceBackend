const mongoose = require('mongoose')
const Schema = mongoose.Schema

const trip = new Schema({
    driver_name:{
        type:String,
        default:''
    },
    vehicle:{
        type:String,
        default:''
    },
    trip_from:{
        type:String,
        default:''
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
    }
})

module.exports = mongoose.model('trip',trip)