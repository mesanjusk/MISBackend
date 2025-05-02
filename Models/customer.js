const mongoose = require('mongoose');

const CustomersSchema = new mongoose.Schema({
    Customer_uuid: { type: String },
    Customer_name: { type: String, required: true, unique: true },  // Ensure the name is unique
    Mobile_number: { type: Number, required: false, unique: true },  // Make mobile number optional
    Customer_group: { type: String, required: true },
    Status: { type: String, default: 'active' },  // Default value for status
    Tags: { type: [String], default: [] },  // Default empty array for tags
    LastInteraction: { type: Date, default: Date.now },  // Default to current date for last interaction
    mobileNumberOptional: { type: Boolean, default: false }  // Add a flag to determine if mobile number is optional
});

// Ensure that duplicate mobile numbers are not allowed
CustomersSchema.index({ Mobile_number: 1 }, { unique: true, sparse: true });  // This makes mobile number optional but still unique if provided

const Customers = mongoose.model("Customers", CustomersSchema);

module.exports = Customers;
