const mongoose = require('mongoose');

const AccountsSchema=new mongoose.Schema({
    Account_uuid: { type: String },
    Account_name: { type: String, required: true },
    Account_type: { type: String, required: true },
    Account_code: { type: Number, required: true },
    Balance: { type: Number, required: true },
    Currency: { type: String, required: true },
    Created_at: { type: Date, required: true },
    Updated_at: { type: Date, required: true },
 },  { timestamps: true })

 const Accounts = mongoose.model("Accounts", AccountsSchema);

module.exports = Accounts;