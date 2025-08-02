// Models/order.js
const mongoose = require('mongoose');

// Status Schema
const statusSchema = new mongoose.Schema({
  Task: { type: String, required: true },
  Assigned: { type: String, required: true },
  Delivery_Date: { type: Date, required: true },
  Status_number: { type: Number, required: true },
  CreatedAt: { type: Date, required: true }
});

// Step Schema
const stepSchema = new mongoose.Schema({
  label: { type: String, required: true },
  checked: { type: Boolean, default: false }
});

// Item Schema ✅
const itemSchema = new mongoose.Schema({
  Item: { type: String }, // ❌ remove required since we're using Items[]

  Quantity: { type: Number, required: true },
  Rate: { type: Number, required: true },
  Amount: { type: Number, required: true }
});

// Orders Schema
const OrdersSchema = new mongoose.Schema({
  Order_uuid: { type: String },
  Order_Number: { type: Number, required: true, unique: true },
  Customer_uuid: { type: String, required: true },
  Priority: { type: String, required: true },
  Item: { type: String, required: true }, // legacy field for single item (optional to keep)
  Items: [itemSchema], // ✅ NEW field for multiple items
  Status: [statusSchema],
  Steps: [stepSchema],
  Remark: { type: String, required: true },
  Rate: { type: Number, default: 0 }, 
  Quantity: { type: Number, default: 0 }, 
  Amount: { type: Number, default: 0 }
}, { timestamps: true });

// Indexes
OrdersSchema.index({ Customer_uuid: 1 });
OrdersSchema.index({ Item: 1 });
OrdersSchema.index({ Priority: 1 });
OrdersSchema.index({ Order_uuid: 1 });
OrdersSchema.index({ Amount: 1 });

const Orders = mongoose.model("Orders", OrdersSchema);
module.exports = Orders;
