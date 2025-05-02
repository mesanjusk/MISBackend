const mongoose = require('mongoose');

const CustomersSchema = new mongoose.Schema({
    Customer_uuid: { type: String },
    Customer_name: { type: String, required: true },
    Mobile_number: { type: Number, unique: true, required: false },  // Mobile is optional
    Customer_group: { type: String, required: true },  // New field
    Status: { type: String, default: 'active' },  // New field with default value
    Tags: { type: [String], default: [] },  // New field with default empty array
    LastInteraction: { type: Date, default: Date.now },  // New field to track the last interaction
});

const Customers = mongoose.model("Customers", CustomersSchema);

module.exports = Customers;
