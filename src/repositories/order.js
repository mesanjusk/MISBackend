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

    status: {
      type: String,
      enum: ["pending", "done", "posted", "paid"],
      default: "pending",
    },
    posting: {
      isPosted: { type: Boolean, default: false },
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

// Item subdoc
const itemSchema = new mongoose.Schema(
  {
    lineId: { type: String, default: uuidv4 },
    Item: { type: String, required: true },
    Quantity: { type: Number, required: true },
    Rate: { type: Number, required: true },
    Amount: { type: Number, required: true },
    Priority: { type: String, default: "Normal" },
    Remark: { type: String, default: "" },
  },
  { _id: true }
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

    // legacy single-line
    Rate: { type: Number, default: 0 },
    Quantity: { type: Number, default: 0 },
    Amount: { type: Number, default: 0 },

    // convenience totals
    saleSubtotal: { type: Number, default: 0 },
    stepsCostTotal: { type: Number, default: 0 },

    // BILL / PAYMENT STATUS
    billStatus: {
      type: String,
      enum: ["unpaid", "paid"],
      default: "unpaid",
      index: true,
    },
    billPaidAt: { type: Date, default: null },
    billPaidBy: { type: String, default: null },
    billPaidNote: { type: String, default: null },
    billPaidTxnUuid: { type: String, default: null },
    billPaidTxnId: { type: Number, default: null },

    // process lifecycle fields
    stage: {
      type: String,
      enum: [
        "enquiry",
        "quoted",
        "approved",
        "design",
        "printing",
        "finishing",
        "ready",
        "delivered",
        "paid",
      ],
      default: "enquiry",
      index: true,
    },
    stageHistory: {
      type: [
        new mongoose.Schema(
          {
            stage: {
              type: String,
              enum: [
                "enquiry",
                "quoted",
                "approved",
                "design",
                "printing",
                "finishing",
                "ready",
                "delivered",
                "paid",
              ],
              required: true,
            },
            timestamp: { type: Date, default: Date.now },
          },
          { _id: false }
        ),
      ],
      default: () => [{ stage: "enquiry", timestamp: new Date() }],
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high"],
      default: "medium",
      index: true,
    },
    dueDate: { type: Date, default: null, index: true },
    assignedTo: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "Users",
  default: null,
  index: true,
},
driveFile: {
  status: {
    type: String,
    enum: ["pending", "created", "failed", "skipped"],
    default: "pending",
  },
  templateFileId: { type: String, default: null },
  fileId: { type: String, default: null },
  folderId: { type: String, default: null },
  name: { type: String, default: null },
  description: { type: String, default: null },
  webViewLink: { type: String, default: null },
  webContentLink: { type: String, default: null },
  error: { type: String, default: null },
  createdAt: { type: Date, default: null },
},
  },
  { timestamps: true }
);

/* ----------------------- Indexes ----------------------- */
OrdersSchema.index({ Customer_uuid: 1 });
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
OrdersSchema.pre("validate", function (next) {
  if (!this.Order_uuid) this.Order_uuid = uuidv4();
  if (!this.stage) this.stage = "enquiry";
  if (!Array.isArray(this.stageHistory)) this.stageHistory = [];
  if (this.stageHistory.length === 0) {
    this.stageHistory.push({ stage: this.stage || "enquiry", timestamp: new Date() });
  }
  next();
});

OrdersSchema.pre("save", function (next) {
  recalcTotals(this);
  next();
});

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