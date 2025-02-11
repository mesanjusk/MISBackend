const mongoose = require('mongoose');

const UsertasksSchema=new mongoose.Schema({
    Usertask_uuid: { type: String },
    Usertask_Number: { type: Number, required: true, unique: true },
    User: { type: String, required: true},
    Usertask_name: { type: String, required: true },   
    Date: { type: Date, required: true },
    Time: { type: String, required: true },
 },  { timestamps: true })

 const Usertasks = mongoose.model("Usertasks", UsertasksSchema);

module.exports = Usertasks;
