const mongoose = require('mongoose');

const PrioritySchema=new mongoose.Schema({
    Priority_uuid: { type: String },
    Priority_name: { type: String, required: true }
 })

 const Priority = mongoose.model("Priority",PrioritySchema);

module.exports = Priority;