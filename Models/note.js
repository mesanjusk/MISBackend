const mongoose = require('mongoose');

const NotesSchema=new mongoose.Schema({
    Note_uuid: { type: String },
    Order_uuid: { type: String, required: true },
    Customer_uuid: { type: String, required: true },
    Note_name: { type: String, required: true }
 })

 const Notes = mongoose.model("Notes", NotesSchema);

module.exports = Notes;