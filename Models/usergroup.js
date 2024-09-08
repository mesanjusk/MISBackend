const mongoose = require('mongoose');

const UsergroupSchema=new mongoose.Schema({
    User_group_uuid: { type: String },
    User_group: { type: String, required: true },
 })

 const Usergroup = mongoose.model("Usergroup", UsergroupSchema);

module.exports = Usergroup;