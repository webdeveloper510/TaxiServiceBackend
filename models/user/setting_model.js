const mongoose = require('mongoose')
const Schema = mongoose.Schema
const CONSTANT = require("../../config/constant");

// Only for Super admin and admins use
const settings = new Schema({
    key:{
        type: String,
        required: true,
        unique: true, // Ensure each key is unique
        trim: true,
    },
    value: {
        type: String,
        default: ''
    }
    

},{timestamps:true})

// 🔥 Static method to seed default settings
settings.statics.seedDefaults = async function () {
  const defaultSettings = CONSTANT.ADMIN_SETTINGS_SEED;

  for (const setting of defaultSettings) {
    const exists = await this.findOne({ key: setting.key });
    if (!exists) {
      await this.create(setting);
      // console.log(`✅ Seeded setting: ${setting.key}`);
    } else {
      // console.log(`ℹ️ Skipped (already exists): ${setting.key}`);
    }
  }
};

module.exports = mongoose.model('settings',settings)