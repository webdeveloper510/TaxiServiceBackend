const mongoose = require('mongoose')
const Schema = mongoose.Schema
const CONSTANT = require("../../config/constant");
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

// 🔥 Static method to seed default settings for car types
cartypes.statics.seedDefaults = async function () {
  const defaultcarTypes = CONSTANT.ADMIN_CAR_TYPE_SEED;

  for (const type of defaultcarTypes) {
    const exists = await this.findOne({ name: type.name });
    console.log('{ key: type.name }----' ,{ name: type.name } , exists)
    if (!exists) {
      await this.create(type);
      console.log(`✅ Seeded setting: ${type.name}`);
    } else {
      // console.log(`ℹ️ Skipped (already exists): ${type.name}`);
    }
  }
};

module.exports = mongoose.model('cartypes',cartypes)