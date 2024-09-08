const mongoose = require('mongoose');

const CustomergroupSchema=new mongoose.Schema({
    Customer_group_uuid: {type: String},
    Customer_group: { type: String, required: true },
 })

 const Customergroup = mongoose.model("Customergroup", CustomergroupSchema);

module.exports = Customergroup;