// Models/order.js
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

/* ----------------------- Sub-schemas ----------------------- */

// Status subdoc
const statusSchema = new mongoose.Schema(
  {
    Task: { type: String, required: true },
    Assigned: { type: String, required: true },
    Delivery_Date: { type: Date, required: true },
    Status_number: { type: Number, required: true },
    CreatedAt: { type: Date, required: true },
  },
  { _id: false }
);

// Step subdoc (enriched for vendor posting)
const stepSchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    checked: { type: Boolean, default: false },

    vendorId: { type: String, default: null },
    vendorName: { type: String, default: null },
    costAmount: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: ["pending", "done", "posted", "paid"], default: "pending" },
    posting: {
      isPosted: { type: Boolean, default: false },
      // allow either ObjectId (Transaction ref) OR a string id/uuid
      txnId: { type: mongoose.Schema.Types.Mixed, default: null },
      postedAt: { type: Date, default: null },
    },
  },
  { _id: true }
);

// vendor required if step is not pending
stepSchema.pre("validate", function (next) {
  if (["done", "posted", "paid"].includes(this.status) && !this.vendorId) {
    return next(new Error(`Vendor is required when step status is ${this.status}`));
  }
  next();
});

// Item subdoc (holds Priority & Remark per line)
const itemSchema = new mongoose.Schema(
  {
    Item: { type: String, required: true },
    Quantity: { type: Number, required: true },
    Rate: { type: Number, required: true },
    Amount: { type: Number, required: true },
    Priority: { type: String, default: "Normal" },
    Remark: { type: String, default: "" },
  },
  { _id: false }
);

/* ----------------------- Order schema ----------------------- */

const OrdersSchema = new mongoose.Schema(
  {
    Order_uuid: { type: String, required: true, unique: true },
    Order_Number: { type: Number, required: true, unique: true },
    Customer_uuid: { type: String, required: true },

    // DEPRECATED (kept for backward compatibility; prefer per-item fields)
    Priority: { type: String, default: undefined, select: false },
    Remark: { type: String, default: undefined, select: false },

    Items: { type: [itemSchema], default: [] },
    Status: { type: [statusSchema], default: [] },
    Steps: { type: [stepSchema], default: [] },

    // legacy single-line (kept for back-compat)
    Rate: { type: Number, default: 0 },
    Quantity: { type: Number, default: 0 },
    Amount: { type: Number, default: 0 },

    // convenience totals
    saleSubtotal: { type: Number, default: 0 },
    stepsCostTotal: { type: Number, default: 0 },

    // ------------------ BILL / PAYMENT STATUS (NEW) ------------------
    billStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
      index: true,
    },
    billPaidAt: { type: Date, default: null },
    billPaidBy: { type: String, default: null },
    billPaidNote: { type: String, default: null },

    // optional link to a transaction later
    billPaidTxnUuid: { type: String, default: null },
    billPaidTxnId: { type: Number, default: null },
  },
  { timestamps: true }
);

/* ----------------------- Indexes ----------------------- */
OrdersSchema.index({ Customer_uuid: 1 });
OrdersSchema.index({ Order_uuid: 1 }, { unique: true });
OrdersSchema.index({ Order_Number: 1 }, { unique: true });
OrdersSchema.index({ Amount: 1 });
OrdersSchema.index({ "Items.Item": 1 });
OrdersSchema.index({ "Steps.vendorId": 1 });
OrdersSchema.index({ "Steps.posting.isPosted": 1 });
OrdersSchema.index({ createdAt: -1 });

/* ----------------------- Helpers ----------------------- */
function recalcTotals(doc) {
  doc.saleSubtotal = (doc.Items || []).reduce((s, it) => s + (+it.Amount || 0), 0);
  doc.stepsCostTotal = (doc.Steps || []).reduce((s, st) => s + (+st.costAmount || 0), 0);
}

/* ----------------------- Hooks ----------------------- */

// Ensure UUID exists
OrdersSchema.pre("validate", function (next) {
  if (!this.Order_uuid) this.Order_uuid = uuidv4();
  next();
});

// Recalculate on save
OrdersSchema.pre("save", function (next) {
  recalcTotals(this);
  next();
});

// Recalculate after findOneAndUpdate (covers $set/$push cases)
OrdersSchema.post("findOneAndUpdate", async function (doc) {
  if (!doc) return;
  recalcTotals(doc);
  await doc.updateOne({
    $set: {
      saleSubtotal: doc.saleSubtotal,
      stepsCostTotal: doc.stepsCostTotal,
    },
  });
});

module.exports = mongoose.model("Orders", OrdersSchema);
