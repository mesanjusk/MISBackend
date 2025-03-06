const mongoose = require('mongoose');

const CustomersSchema=new mongoose.Schema({
    Customer_uuid: { type: String },
    Customer_name: { type: String, required: true },
    Mobile_number: { type: String, required: true, unique: true },
    Customer_group: { type: String, required: true },
 })

 const Customers = mongoose.model("Customers", CustomersSchema);

module.exports = Customers;