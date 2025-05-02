const mongoose = require('mongoose');

const CustomersSchema = new mongoose.Schema({
    Customer_uuid: { type: String },
    Customer_name: { type: String, required: true },
    Mobile_number: { type: String }, 
    Customer_group: { type: String, required: true },
    Status: { type: String, default: 'active' },
    Tags: { type: [String], default: [] },
    LastInteraction: { type: Date, default: Date.now },
});

const Customers = mongoose.model("Customers", CustomersSchema);

module.exports = Customers;
