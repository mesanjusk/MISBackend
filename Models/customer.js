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

// Indexes to speed up common queries
CustomersSchema.index({ Customer_name: 1 });
CustomersSchema.index({ Customer_uuid: 1 });
CustomersSchema.index({ Mobile_number: 1 });

const Customers = mongoose.model("Customers", CustomersSchema);

module.exports = Customers;
