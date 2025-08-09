const mongoose = require('mongoose');

// --- Status subdoc
const statusSchema = new mongoose.Schema({
  Task: { type: String, required: true },
  Assigned: { type: String, required: true },
  Delivery_Date: { type: Date, required: true },
  Status_number: { type: Number, required: true },
  CreatedAt: { type: Date, required: true }
}, { _id: false });

// --- Step subdoc (enriched so you can assign vendors later)
const stepSchema = new mongoose.Schema({
  label:   { type: String, required: true },
  checked: { type: Boolean, default: false },

  vendorId:   { type: String, default: null },
  vendorName: { type: String, default: null },
  costAmount: { type: Number, default: 0, min: 0 },

  status: { type: String, enum: ['pending','done','posted','paid'], default: 'pending' },
  posting: {
    isPosted: { type: Boolean, default: false },
    txnId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    postedAt: { type: Date, default: null }
  }
}, { _id: true });

// --- Item subdoc
const itemSchema = new mongoose.Schema({
  Item: { type: String, required: true },
  Quantity: { type: Number, required: true },
  Rate: { type: Number, required: true },
  Amount: { type: Number, required: true }
}, { _id: false });

// --- Order
const OrdersSchema = new mongoose.Schema({
  Order_uuid: { type: String },
  Order_Number: { type: Number, required: true, unique: true },
  Customer_uuid: { type: String, required: true },
  Priority: { type: String, required: true },

  Items:  [itemSchema],
  Status: [statusSchema],
  Steps:  [stepSchema],

  Remark: { type: String, required: true },

  // legacy single-line
  Rate: { type: Number, default: 0 },
  Quantity: { type: Number, default: 0 },
  Amount: { type: Number, default: 0 },

  // convenience totals (optional)
  saleSubtotal:   { type: Number, default: 0 },
  stepsCostTotal: { type: Number, default: 0 }
}, { timestamps: true });

// Indexes
OrdersSchema.index({ Customer_uuid: 1 });
OrdersSchema.index({ Priority: 1 });
OrdersSchema.index({ Order_uuid: 1 });
OrdersSchema.index({ Amount: 1 });
OrdersSchema.index({ 'Items.Item': 1 });
OrdersSchema.index({ 'Steps.vendorId': 1 });
OrdersSchema.index({ 'Steps.posting.isPosted': 1 });

// auto totals
OrdersSchema.pre('save', function(next){
  this.saleSubtotal = (this.Items || []).reduce((s,it)=>s+(+it.Amount||0),0);
  this.stepsCostTotal = (this.Steps || []).reduce((s,st)=>s+(+st.costAmount||0),0);
  next();
});

module.exports = mongoose.model('Orders', OrdersSchema);
