const mongoose = require('mongoose'); 

// Status Schema
const statusSchema = new mongoose.Schema({
  Task: { type: String, required: true },
  Assigned: { type: String, required: true },
  Delivery_Date: { type: Date, required: true },
  Status_number: { type: Number, required: true },
  CreatedAt: { type: Date, required: true }
});

// Step Schema (new)
const stepSchema = new mongoose.Schema({
  label: { type: String, required: true },
  checked: { type: Boolean, default: false }
});

// Orders Schema
const OrdersSchema = new mongoose.Schema({
  Order_uuid: { type: String },
  Order_Number: { type: Number, required: true, unique: true },
  Customer_uuid: { type: String, required: true },
  Priority: { type: String, required: true },
  Item: { type: String, required: true },
  Status: [statusSchema],
  Steps: [stepSchema], // ✅ NEW FIELD
  Remark: { type: String, required: true },
  Rate: { type: Number, default: 0 }, 
  Quantity: { type: Number, default: 0 }, 
  Amount: { type: Number, default: 0 },
}, { timestamps: true });

// Indexes for faster querying and sorting
OrdersSchema.index({ Order_Number: 1 });
OrdersSchema.index({ Customer_uuid: 1 });
OrdersSchema.index({ Item: 1 });
OrdersSchema.index({ Priority: 1 });
OrdersSchema.index({ Order_uuid: 1 });
OrdersSchema.index({ Amount: 1 });

const Orders = mongoose.model("Orders", OrdersSchema);
module.exports = Orders;
