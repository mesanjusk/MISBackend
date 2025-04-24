const mongoose = require('mongoose');

const UsersSchema=new mongoose.Schema({
    User_uuid: { type: String },
    User_name: { type: String, required: true },
    Password: { type:String, required: true},
    Mobile_number: { type: Number, required: true, unique: true },
    User_group: { type: String, required: true },
    Amount: { type: Number, required: true},
    AccountID: { type: String}
 })

 const Users = mongoose.model("Users", UsersSchema);

module.exports = Users;