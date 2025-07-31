const mongoose = require('mongoose');

const PrioritySchema=new mongoose.Schema({
    Priority_uuid: { type: String },
    Priority_name: { type: String, required: true }
})

// Index for quick name lookups
PrioritySchema.index({ Priority_name: 1 });

 const Priority = mongoose.model("Priority",PrioritySchema);

module.exports = Priority;