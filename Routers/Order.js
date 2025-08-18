// routes/order.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Orders = require("../Models/order");
const Transaction = require("../Models/transaction");
const { v4: uuid } = require("uuid");
const { updateOrderStatus } = require("../Controller/orderController");

/* ----------------------- helpers ----------------------- */
const norm = (s) => String(s || "").trim();
const normLower = (s) => String(s || "").trim().toLowerCase();
const toDate = (v, fallback = new Date()) => (v ? new Date(v) : fallback);

// Ensure each item has per-line Priority & Remark (resilient to key casing)
function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .filter(Boolean)
    .map((it) => {
      const name = String(it.Item ?? it.item ?? "").trim();
      const qty = Number(it.Quantity ?? it.quantity ?? 0);
      const rate = Number(it.Rate ?? it.rate ?? 0);
      const amt = Number(it.Amount ?? it.amount ?? (qty * rate) ?? 0);

      const priorityRaw = it.Priority ?? it.priority ?? "Normal";
      const remarkRaw =
        it.Remark ??
        it.remark ??
        it.remarks ??
        it.comment ??
        it.note ??
        "";

      return {
        Item: name,
        Quantity: qty,
        Rate: rate,
        Amount: amt,
        Priority: String(priorityRaw || "Normal"),
        Remark: String(remarkRaw || ""),
      };
    })
    .filter((it) => it.Item); // keep only valid lines
}

// Steps in DB don’t have vendorCustomerUuid; still accept it and store in vendorId
// UPDATED: persist uuid and normLabel if FE sends them
function normalizeSteps(steps) {
  if (!Array.isArray(steps)) return [];
  return steps.reduce((acc, step) => {
    const label = typeof step?.label === "string" ? step.label.trim() : "";
    if (!label) return acc;

    const amount = Number(step.costAmount ?? 0);
    acc.push({
      uuid: typeof step?.uuid === "string" ? step.uuid.trim() : undefined,
      label,
      normLabel: normLower(label),
      checked: !!step.checked,
      vendorId: step.vendorCustomerUuid ?? step.vendorId ?? null,
      vendorName: step.vendorName ?? null,
      costAmount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
      plannedDate: step.plannedDate ? new Date(step.plannedDate) : undefined,
      status: step.status || "pending",
      posting:
        step.posting && typeof step.posting === "object"
          ? step.posting
          : { isPosted: false, txnId: null, postedAt: null },
    });
    return acc;
  }, []);
}

/* ----------------------- CREATE NEW ORDER ----------------------- */
router.post("/addOrder", async (req, res) => {
  try {
    const {
      Customer_uuid,
      // order-level Priority/Remark are deprecated – ignore on write
      Status = [{}],
      Steps = [],
      Items = [],
    } = req.body;

    const now = new Date();
    const statusDefaults = {
      Task: "Design",
      Assigned: "Sai",
      Status_number: 1,
      Delivery_Date: now,
      CreatedAt: now,
    };

    const updatedStatus = (Status || []).map((s) => ({
      ...statusDefaults,
      ...s,
      Delivery_Date: toDate(s?.Delivery_Date, now),
      CreatedAt: toDate(s?.CreatedAt, now),
    }));

    if (!updatedStatus[0]?.Task || !updatedStatus[0]?.Assigned || !updatedStatus[0]?.Delivery_Date) {
      return res.status(400).json({
        success: false,
        message: "Task, Assigned, and Delivery_Date are required in Status[0].",
      });
    }

    const flatSteps = normalizeSteps(Steps);
    const lineItems = normalizeItems(Items);

    // Fallback: if FE didn’t send Items but sent a top-level remark-like field, save as a note line
    const topRemark =
      (req.body && (req.body.Remark || req.body.remark || req.body.note || req.body.comments)) || "";
    if (lineItems.length === 0 && String(topRemark).trim()) {
      lineItems.push({
        Item: "Order Note",
        Quantity: 0,
        Rate: 0,
        Amount: 0,
        Priority: "Normal",
        Remark: String(topRemark).trim(),
      });
    }

    const lastOrder = await Orders.findOne().sort({ Order_Number: -1 }).lean();
    const newOrderNumber = lastOrder ? lastOrder.Order_Number + 1 : 1;

    const newOrder = new Orders({
      Order_uuid: uuid(),
      Order_Number: newOrderNumber,
      Customer_uuid,
      Status: updatedStatus,
      Steps: flatSteps,
      Items: lineItems,
    });

    await newOrder.save();

    res.json({
      success: true,
      message: "Order added successfully",
      orderId: newOrder._id,
      orderNumber: newOrderNumber,
    });
  } catch (error) {
    console.error("Error saving order:", error);
    res.status(500).json({ success: false, message: "Failed to add order" });
  }
});

/* ----------------------- UNIFIED VIEW (kept) ----------------------- */
router.get("/all-data", async (req, res) => {
  try {
    const delivered = await Orders.find({ Status: { $elemMatch: { Task: "Delivered" } } });

    const report = await Orders.find({
      Status: { $elemMatch: { Task: "Delivered" } },
      Items: { $exists: true, $not: { $size: 0 } },
    });

    const outstanding = await Orders.find({
      Status: { $not: { $elemMatch: { Task: "Delivered" } } },
    });

    // show steps that need vendor or are not posted yet
    const allvendors = await Orders.aggregate([
      {
        $addFields: {
          stepsNeedingVendor: {
            $filter: {
              input: "$Steps",
              as: "st",
              cond: {
                $or: [
                  { $eq: ["$$st.vendorId", null] },
                  { $eq: ["$$st.vendorId", ""] },
                  { $eq: ["$$st.posting.isPosted", false] },
                ],
              },
            },
          },
        },
      },
      { $match: { "stepsNeedingVendor.0": { $exists: true } } },
      {
        $project: {
          Order_uuid: 1,
          Order_Number: 1,
          Customer_uuid: 1,
          // items' remarks for FE
          ItemsRemarks: "$Items.Remark",
          StepsPending: {
            $map: {
              input: "$stepsNeedingVendor",
              as: "s",
              in: {
                stepId: "$$s._id",
                label: "$$s.label",
                vendorId: "$$s.vendorId",
                vendorName: "$$s.vendorName",
                costAmount: "$$s.costAmount",
                isPosted: "$$s.posting.isPosted",
              },
            },
          },
        },
      },
      { $sort: { Order_Number: -1 } },
    ]);

    const bills = await Orders.find({
      Status: { $elemMatch: { Task: "Delivered" } },
      $or: [{ Items: { $exists: false } }, { Items: { $size: 0 } }],
    });

    res.json({ delivered, report, outstanding, allvendors, bills });
  } catch (error) {
    console.error("Error generating unified report:", error.message);
    res.status(500).json({ error: "Failed to load report data" });
  }
});

/* ----------------------- RAW FEED for AllVendors ----------------------- */
/** Includes Status so FE can inspect latest. Option ?deliveredOnly=true */
router.get("/allvendors-raw", async (req, res) => {
  try {
    const deliveredOnly = String(req.query.deliveredOnly || "").toLowerCase() === "true";

    const pipeline = [
      {
        $project: {
          Order_Number: 1,
          Customer_uuid: 1,
          Items: 1,
          Steps: 1,
          Status: 1,
          latestStatus: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$Status", []] } }, 0] },
              { $arrayElemAt: ["$Status", { $subtract: [{ $size: "$Status" }, 1] }] },
              null,
            ],
          },
        },
      },
      // Build a flat RemarkText from Items[].Remark (trim + join)
      {
        $addFields: {
          RemarkText: {
            $let: {
              vars: {
                rems: {
                  $filter: {
                    input: {
                      $map: {
                        input: { $ifNull: ["$Items", []] },
                        as: "it",
                        in: { $trim: { input: { $ifNull: ["$$it.Remark", ""] } } },
                      },
                    },
                    as: "r",
                    cond: { $ne: ["$$r", ""] },
                  },
                },
              },
              in: {
                $reduce: {
                  input: "$$rems",
                  initialValue: "",
                  in: {
                    $cond: [
                      { $eq: ["$$value", ""] },
                      "$$this",
                      { $concat: ["$$value", " | ", "$$this"] },
                    ],
                  },
                },
              },
            },
          },
        },
      },
      ...(deliveredOnly ? [{ $match: { "latestStatus.Task": { $regex: /^delivered$/i } } }] : []),
      { $sort: { Order_Number: -1 } },
    ];

    const docs = await Orders.aggregate(pipeline);
    res.json({ rows: docs, total: docs.length });
  } catch (e) {
    console.error("allvendors-raw error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------- LEGACY PAGE: ALL VENDORS (kept) ----------------------- */
router.get("/allvendors", async (req, res) => {
  try {
    const search = (req.query.search || "").trim();

    const match = {};
    if (search) {
      const num = +search;
      match.$or = [
        { Order_Number: Number.isNaN(num) ? -1 : num }, // Order number
        { Customer_uuid: new RegExp(search, "i") }, // customer id
        { "Items.Remark": new RegExp(search, "i") }, // any item remark
      ];
    }

    const rows = await Orders.aggregate([
      { $match: Object.keys(match).length ? match : {} },
      {
        $addFields: {
          stepsNeedingVendor: {
            $filter: {
              input: "$Steps",
              as: "st",
              cond: {
                $or: [
                  { $eq: ["$$st.vendorId", null] },
                  { $eq: ["$$st.vendorId", ""] },
                  { $eq: ["$$st.posting.isPosted", false] },
                ],
              },
            },
          },
        },
      },
      { $match: { "stepsNeedingVendor.0": { $exists: true } } },
      {
        $project: {
          Order_uuid: 1,
          Order_Number: 1,
          Customer_uuid: 1,
          Items: 1, // FE can read per-line Priority/Remark
          StepsPending: {
            $map: {
              input: "$stepsNeedingVendor",
              as: "s",
              in: {
                stepId: "$$s._id",
                label: "$$s.label",
                vendorId: "$$s.vendorId",
                vendorName: "$$s.vendorName",
                costAmount: "$$s.costAmount",
                isPosted: "$$s.posting.isPosted",
              },
            },
          },
        },
      },
      { $sort: { Order_Number: -1 } },
    ]);

    res.json({ rows, total: rows.length });
  } catch (e) {
    console.error("allvendors error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------- STATUS APIs ----------------------- */
router.post("/updateStatus", async (req, res) => {
  const { orderId, newStatus } = req.body;
  const result = await updateOrderStatus(orderId, newStatus);
  res.json(result);
});

router.post("/addStatus", async (req, res) => {
  const { orderId, newStatus } = req.body;
  try {
    const result = await updateOrderStatus(orderId, newStatus);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

/* ----------------------- UPDATE ORDER (generic) ----------------------- */
router.put("/updateOrder/:id", async (req, res) => {
  try {
    const { Delivery_Date, Items, ...otherFields } = req.body;

    // normalize line items if provided
    if (Items) otherFields.Items = normalizeItems(Items);

    const order = await Orders.findById(req.params.id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (Delivery_Date) {
      const lastIndex = (order.Status?.length || 1) - 1;
      if (lastIndex >= 0) {
        order.Status[lastIndex].Delivery_Date = toDate(
          Delivery_Date,
          order.Status[lastIndex].Delivery_Date
        );
      }
    }

    Object.assign(order, otherFields);
    const saved = await order.save();
    return res.json({ success: true, result: saved });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ----------------------- UPDATE DELIVERY (Items only) ----------------------- */
router.put("/updateDelivery/:id", async (req, res) => {
  const { id } = req.params;
  const { Customer_uuid, Items } = req.body;
  try {
    const order = await Orders.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });

    if (Customer_uuid) order.Customer_uuid = Customer_uuid;

    // Append new Items to preserve initial "Order Note" line
    if (Items) {
      const incoming = normalizeItems(Items);
      order.Items = normalizeItems([...(order.Items || []), ...incoming]);
    }

    await order.save();
    res.status(200).json({ success: true, message: "Order updated successfully" });
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ success: false, message: "Error updating order", error: error.message });
  }
});

/* ----------------------- LISTS ----------------------- */
router.get("/GetOrderList", async (req, res) => {
  try {
    const data = await Orders.find({});
    const filteredData = data.filter((o) => {
      const delivered = o.Status?.some((s) => norm(s.Task).toLowerCase() === "delivered");
      const cancelled = o.Status?.some((s) => norm(s.Task).toLowerCase() === "cancel");
      return !(delivered || cancelled);
    });
    res.json({ success: true, result: filteredData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// helper: does this order have any item with Amount > 0?
const hasBillableAmount = (items) =>
  Array.isArray(items) && items.some((it) => Number(it?.Amount) > 0);

// Delivered AND NO billable amount (0 or missing across all items)
router.get("/GetDeliveredList", async (req, res) => {
  try {
    const data = await Orders.find({}).lean();
    const filtered = data.filter((o) => {
      const delivered = o.Status?.some((s) => norm(s.Task).toLowerCase() === "delivered");
      return delivered && !hasBillableAmount(o.Items);
    });
    res.json({ success: true, result: filtered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delivered AND HAS billable amount (any item Amount > 0)
router.get("/GetBillList", async (req, res) => {
  try {
    const data = await Orders.find({}).lean();
    const filtered = data.filter((o) => {
      const delivered = o.Status?.some((s) => norm(s.Task).toLowerCase() === "delivered");
      return delivered && hasBillableAmount(o.Items);
    });
    res.json({ success: true, result: filtered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


/* ----------------------- CUSTOMER CHECKS ----------------------- */
router.get("/CheckCustomer/:customerUuid", async (req, res) => {
  const { customerUuid } = req.params;
  try {
    const orderExists = await Orders.findOne({ Customer_uuid: customerUuid });
    res.json({ exists: !!orderExists });
  } catch (error) {
    console.error("Error checking orders:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/CheckMultipleCustomers", async (req, res) => {
  try {
    const { ids } = req.body;
    const linked = await Orders.find({ Customer_uuid: { $in: ids } }).distinct("Customer_uuid");
    res.status(200).json({ linkedIds: linked });
  } catch (err) {
    res.status(500).json({ error: "Error checking linked orders" });
  }
});

/* ----------------------- GET BY ID ----------------------- */
router.get("/:id", async (req, res) => {
  const orderId = req.params.id;
  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
});

/* ----------------------- REPORTS: VENDOR MISSING ----------------------- */
router.get("/reports/vendor-missing", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const skip = (page - 1) * limit;
    const deliveredOnly = req.query.deliveredOnly === "true";
    const search = (req.query.search || "").trim();

    const match = {};
    if (deliveredOnly) match.Status = { $elemMatch: { Task: "Delivered" } };
    if (search) {
      const num = +search;
      match.$or = [
        { Order_Number: Number.isNaN(num) ? -1 : num },
        { Customer_uuid: new RegExp(search, "i") },
        { "Items.Remark": new RegExp(search, "i") },
      ];
    }

    const pipeline = [
      { $match: match },
      {
        $addFields: {
          stepsNeedingVendor: {
            $filter: {
              input: "$Steps",
              as: "st",
              cond: {
                $or: [
                  { $eq: ["$$st.vendorId", null] },
                  { $eq: ["$$st.vendorId", ""] },
                  { $eq: ["$$st.posting.isPosted", false] },
                ],
              },
            },
          },
        },
      },
      { $match: { "stepsNeedingVendor.0": { $exists: true } } },
      {
        $project: {
          Order_uuid: 1,
          Order_Number: 1,
          Customer_uuid: 1,
          Items: 1, // includes per-line Priority/Remark
          StepsPending: {
            $map: {
              input: "$stepsNeedingVendor",
              as: "s",
              in: {
                stepId: "$$s._id",
                label: "$$s.label",
                vendorId: "$$s.vendorId",
                vendorName: "$$s.vendorName",
                costAmount: "$$s.costAmount",
                isPosted: "$$s.posting.isPosted",
              },
            },
          },
        },
      },
      { $sort: { Order_Number: -1 } },
      { $facet: { data: [{ $skip: skip }, { $limit: limit }], total: [{ $count: "count" }] } },
    ];

    const result = await Orders.aggregate(pipeline);
    const data = result[0]?.data || [];
    const total = result[0]?.total?.[0]?.count || 0;
    res.json({ page, limit, total, rows: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ------------------ CREATE STEP ------------------ */
router.post("/orders/:orderId/steps", async (req, res) => {
  const { orderId } = req.params;
  const {
    uuid: stepUuid,
    label,
    vendorCustomerUuid = null,
    vendorId = null,
    vendorName = null,
    costAmount = 0,
    plannedDate = null,
    checked = false,
    status = "pending",
  } = req.body;

  if (!label || typeof label !== "string") {
    return res.status(400).json({ ok: false, error: "label is required" });
  }

  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ ok: false, error: "Order not found" });

    const step = {
      uuid: stepUuid ? String(stepUuid).trim() : undefined,
      label: String(label).trim(),
      normLabel: normLower(label),
      checked: !!checked,
      vendorId: vendorCustomerUuid ?? vendorId ?? null,
      vendorName,
      costAmount: Number(costAmount || 0),
      plannedDate: plannedDate ? new Date(plannedDate) : undefined,
      status,
      posting: { isPosted: false, txnId: null, postedAt: null },
    };

    order.Steps = Array.isArray(order.Steps) ? order.Steps : [];
    order.Steps.push(step);
    await order.save();

    const created = order.Steps[order.Steps.length - 1];
    res.json({ ok: true, stepId: created._id, steps: order.Steps });
  } catch (e) {
    console.error("create step error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ------------------ EDIT STEP (no posting side effects) ------------------ */
router.patch("/orders/:orderId/steps/:stepId", async (req, res) => {
  const { orderId, stepId } = req.params;
  const allowed = [
    "uuid",
    "label",
    "vendorId",
    "vendorCustomerUuid",
    "vendorName",
    "costAmount",
    "plannedDate",
    "status",
    "checked",
  ];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ ok: false, error: "Order not found" });

    const step = order.Steps.id(stepId);
    if (!step) return res.status(404).json({ ok: false, error: "Step not found" });

    if ("plannedDate" in patch && patch.plannedDate) patch.plannedDate = new Date(patch.plannedDate);
    if ("costAmount" in patch) patch.costAmount = Number(patch.costAmount || 0);
    if ("vendorCustomerUuid" in patch && patch.vendorCustomerUuid && !patch.vendorId) {
      patch.vendorId = patch.vendorCustomerUuid; // map to stored field
    }
    if ("label" in patch && patch.label) {
      patch.label = String(patch.label).trim();
      patch.normLabel = normLower(patch.label); // keep normalized label
    }
    if ("uuid" in patch && patch.uuid) {
      patch.uuid = String(patch.uuid).trim();
    }

    Object.assign(step, patch);
    await order.save();
    res.json({ ok: true, step });
  } catch (e) {
    console.error("edit step error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ************* ASSIGN VENDOR & POST (uses "purchase") ************* */
router.post("/orders/:orderId/steps/:stepId/assign-vendor", async (req, res) => {
  const { orderId, stepId } = req.params;
  const { vendorId, vendorName, vendorCustomerUuid, costAmount, plannedDate, createdBy } = req.body;

  const resolvedVendor = vendorId || vendorCustomerUuid || vendorName;
  if (!resolvedVendor)
    return res
      .status(400)
      .json({ ok: false, error: "Provide vendorId or vendorCustomerUuid or vendorName" });

  const amount = Number(costAmount ?? 0);
  if (Number.isNaN(amount) || amount < 0)
    return res.status(400).json({ ok: false, error: "Invalid costAmount" });

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const order = await Orders.findById(orderId).session(session);
      if (!order) throw new Error("Order not found");

      const step = order.Steps.id(stepId);
      if (!step) throw new Error("Step not found");

      // Save vendor info on step
      step.vendorId = vendorCustomerUuid ?? vendorId ?? step.vendorId ?? null;
      step.vendorName = vendorName ?? step.vendorName ?? null;
      step.costAmount = amount;
      if (plannedDate) step.plannedDate = new Date(plannedDate);

      // Already posted? only update vendor info
      if (step.posting?.isPosted) {
        await order.save({ session });
        return res.json({
          ok: true,
          message: "Vendor saved. Step already posted.",
          txnId: step.posting.txnId,
        });
      }

      // Zero amount => mark done, no posting
      if (amount === 0) {
        step.status = "done";
        step.posting = { isPosted: false, txnId: null, postedAt: null };
        await order.save({ session });
        return res.json({ ok: true, message: "Vendor saved (no posting for 0 amount)." });
      }

      // Journal lines
      const lines = [
        { Account_id: `${resolvedVendor}`, Type: "Debit", Amount: amount },
        // "purchase" account (static id)
        { Account_id: "fdf29a16-1e87-4f57-82d6-6b31040d3f1e", Type: "Credit", Amount: amount },
      ];

      const txnDate = plannedDate ? new Date(plannedDate) : new Date();

      const lastTxn = await Transaction.findOne({}, { Transaction_id: 1 })
        .sort({ Transaction_id: -1 })
        .session(session)
        .lean();
      const nextId = (lastTxn?.Transaction_id || 0) + 1;

      const txnDocs = await Transaction.create(
        [
          {
            Transaction_uuid: uuid(),
            Transaction_id: nextId,
            Order_uuid: order.Order_uuid || null,
            Order_number: order.Order_Number,
            Transaction_date: txnDate,
            Description: `Outsource step: ${step.label} (Order #${order.Order_Number})`,
            Total_Debit: amount,
            Total_Credit: amount,
            Payment_mode: "purchase",
            Created_by: createdBy || "system",
            image: null,
            Journal_entry: lines,
          },
        ],
        { session }
      );

      step.posting = { isPosted: true, txnId: txnDocs[0]._id, postedAt: new Date() };
      step.status = "posted";

      await order.save({ session });
      res.json({ ok: true, txnId: txnDocs[0]._id, transactionId: nextId });
    });
  } catch (e) {
    console.error("assign-vendor error:", e);
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    session.endSession();
  }
});

/* ------------------ TOGGLE STEP (add on check, remove on uncheck) ------------------ */
// body: { orderId, step: { uuid, label }, checked: true|false }
router.post("/steps/toggle", async (req, res) => {
  try {
    const { orderId, step = {}, checked } = req.body || {};
    if (!orderId || typeof checked !== "boolean") {
      return res.status(400).json({ success: false, message: "orderId and checked are required" });
    }
    const uuidStr = norm(step.uuid || "");
    const label = norm(step.label || "");
    const labelNorm = normLower(label);

    if (!uuidStr && !label) {
      return res.status(400).json({ success: false, message: "Provide step.uuid or step.label" });
    }

    const find = { _id: orderId };

    if (checked) {
      // Add if not already present (uuid OR normalized label match)
      const doc = await Orders.findOne(find, { Steps: 1 }).lean();
      if (!doc) return res.status(404).json({ success: false, message: "Order not found" });

      const exists =
        Array.isArray(doc.Steps) &&
        doc.Steps.some((s) =>
          (uuidStr && String(s.uuid || "") === uuidStr) ||
          (label && normLower(s.normLabel || s.label || "") === labelNorm)
        );

      if (exists) return res.json({ success: true, updated: false });

      const now = new Date();
      await Orders.updateOne(find, {
        $push: {
          Steps: {
            uuid: uuidStr || undefined,
            label,
            normLabel: labelNorm,
            checked: true,
            vendorId: null,
            vendorName: null,
            costAmount: 0,
            plannedDate: undefined,
            status: "pending",
            posting: { isPosted: false, txnId: null, postedAt: null },
            addedAt: now,
          },
        },
      });
      return res.json({ success: true, updated: true });
    } else {
      // Remove by uuid if present, otherwise by normalized label
      const pullBy = uuidStr
        ? { uuid: uuidStr }
        : { $or: [{ normLabel: labelNorm }, { label }] };
      await Orders.updateOne(find, { $pull: { Steps: pullBy } });
      return res.json({ success: true, updated: true });
    }
  } catch (e) {
    console.error("/order/steps/toggle error", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
