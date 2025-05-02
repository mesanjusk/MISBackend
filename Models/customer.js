const mongoose = require('mongoose');

const CustomersSchema = new mongoose.Schema({
    Customer_uuid: { type: String },
    Customer_name: { type: String, required: true },
    Mobile_number: { type: Number, required: true, unique: true },
    Customer_group: { type: String, required: true },
    Status: { type: String, default: 'active' }, // New field
    Tags: { type: [String], default: [] }, // New field
    LastInteraction: { type: Date, default: Date.now }, // New field
});

const Customers = mongoose.model("Customers", CustomersSchema);

module.exports = Customers;
