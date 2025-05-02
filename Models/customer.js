const mongoose = require('mongoose');

const CustomersSchema = new mongoose.Schema({
    Customer_uuid: { type: String },
    Customer_name: { type: String, required: true },
    Mobile_number: { type: Number, required: true, unique: true },
    Customer_group: { type: String, required: true },
    Status: { type: String, default: 'active' },  // New field for customer status
    Tags: { type: [String], default: [] },  // New field for customer tags (e.g., "unsatisfied", "high_value")
    LastInteraction: { type: Date, default: Date.now },  // New field for last interaction date
});

const Customers = mongoose.model("Customers", CustomersSchema);

module.exports = Customers;
