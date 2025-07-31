const mongoose = require('mongoose');

const Payment_modeSchema=new mongoose.Schema({
    Payment_mode_uuid: { type: String },
    Payment_name: { type: String, required: true },
})

// Index for name searches
Payment_modeSchema.index({ Payment_name: 1 });

 const Payment_mode = mongoose.model("Payment_mode", Payment_modeSchema);

module.exports = Payment_mode;