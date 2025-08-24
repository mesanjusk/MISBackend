// Routers/Order.js
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
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// pagination helper with sane caps
function getPaging(req, defaults = { page: 1, limit: 50, max: 200 }) {
  const page = Math.max(1, parseInt(req.query.page || defaults.page, 10) || 1);
  const rawLimit = parseInt(req.query.limit || defaults.limit, 10) || defaults.limit;
  const limit = Math.min(Math.max(1, rawLimit), defaults.max);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

// basic search helper for order number / customer / item remark
function buildSearchMatch(q) {
  const search = (q || "").trim();
  if (!search) return {};

  const num = Number(search);
  const numericOr = Number.isFinite(num) ? [{ Order_Number: num }] : [];

  // regex kept for flexibility (index recommendation provided separately)
  const rx = new RegExp(escapeRegex(search), "i");
  return {
    $or: [
      ...numericOr,
      { Customer_uuid: rx },
      { "Items.Remark": rx },
    ],
  };
}

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
    .filter((it) => it.Item);
}

// Steps: persist uuid & normLabel if available
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

    // fetch last order number lean + projection only what we need
    const lastOrder = await Orders.findOne({}, { Order_Number: 1 }).sort({ Order_Number: -1 }).lean();
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
    // return only fields used by UI
    const proj = {
      Order_uuid: 1,
      Order_Number: 1,
      Customer_uuid: 1,
      Items: 1,
      Status: 1,
      Steps: 1,
      createdAt: 1,
      updatedAt: 1,
    };

    const delivered = await Orders.find(
      { Status: { $elemMatch: { Task: "Delivered" } } },
      proj
    ).sort({ Order_Number: -1 }).limit(200).lean();

    const report = await Orders.find(
      {
        Status: { $elemMatch: { Task: "Delivered" } },
        Items: { $exists: true, $not: { $size: 0 } },
      },
      proj
    ).sort({ Order_Number: -1 }).limit(200).lean();

    const outstanding = await Orders.find(
      { Status: { $not: { $elemMatch: { Task: "Delivered" } } } },
      proj
    ).sort({ Order_Number: -1 }).limit(200).lean();

    const allvendors = await Orders.aggregate([
      {
        $project: {
          Order_uuid: 1,
          Order_Number: 1,
          Customer_uuid: 1,
          Items: 1,
          Steps: 1,
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
      { $limit: 200 },
    ]);

    const bills = await Orders.find(
      {
        Status: { $elemMatch: { Task: "Delivered" } },
        $or: [{ Items: { $exists: false } }, { Items: { $size: 0 } }],
      },
      { Order_uuid: 1, Order_Number: 1, Customer_uuid: 1, Items: 1, Status: 1 }
    ).sort({ Order_Number: -1 }).limit(200).lean();

    res.json({ delivered, report, outstanding, allvendors, bills });
  } catch (error) {
    console.error("Error generating unified report:", error.message);
    res.status(500).json({ error: "Failed to load report data" });
  }
});

/* ----------------------- RAW FEED for AllVendors (PAGINATED) ----------------------- */
router.get("/allvendors-raw", async (req, res) => {
  try {
    const { page, limit, skip } = getPaging(req);
    const deliveredOnly = String(req.query.deliveredOnly || "").toLowerCase() === "true";
    const searchMatch = buildSearchMatch(req.query.search);

    const baseMatch = deliveredOnly
      ? { ...searchMatch, Status: { $elemMatch: { Task: /^delivered$/i } } }
      : { ...searchMatch };

    const pipeline = [
      { $match: baseMatch },
      {
        $project: {
          Order_uuid: 1,
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
      // only keep orders with at least 1 step needing vendor OR not yet posted
      {
        $addFields: {
          StepsPending: {
            $filter: {
              input: "$Steps",
              as: "s",
              cond: {
                $or: [
                  { $eq: ["$$s.vendorId", null] },
                  { $eq: ["$$s.vendorId", ""] },
                  { $eq: ["$$s.posting.isPosted", false] },
                ],
              },
            },
          },
        },
      },
      { $match: { "StepsPending.0": { $exists: true } } },
      { $sort: { Order_Number: -1 } },
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
      {
        $project: {
          rows: "$data",
          total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
        },
      },
    ];

    const out = await Orders.aggregate(pipeline);
    const { rows = [], total = 0 } = out[0] || {};
    res.json({ page, limit, total, rows });
  } catch (e) {
    console.error("allvendors-raw error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------- LEGACY PAGE: ALL VENDORS (kept) ----------------------- */
router.get("/allvendors", async (req, res) => {
  try {
    const { page, limit, skip } = getPaging(req);
    const search = (req.query.search || "").trim();

    const match = buildSearchMatch(search);

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
          Items: 1,
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
      {
        $facet: {
          data: [{ $skip: skip }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
      {
        $project: {
          rows: "$data",
          total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
        },
      },
    ];

    const result = await Orders.aggregate(pipeline);
    const { rows = [], total = 0 } = result[0] || {};
    res.json({ page, limit, total, rows });
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

/* ----------------------- UPDATE DELIVERY (Items only, atomic) ----------------------- */
router.put("/updateDelivery/:id", async (req, res) => {
  const { id } = req.params;
  const { Customer_uuid, Items } = req.body;

  try {
    const isObjectId = mongoose.isValidObjectId(id);
    const filter = isObjectId ? { _id: id } : { Order_uuid: id };

    const incoming = normalizeItems(Items || []);
    if (!Customer_uuid && incoming.length === 0) {
      return res.status(400).json({ success: false, message: "Nothing to update" });
    }

    const update = {};
    if (Customer_uuid) update.$set = { Customer_uuid };
    if (incoming.length > 0) update.$push = { Items: { $each: incoming } };

    const result = await Orders.updateOne(filter, update, { runValidators: false });
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    const refreshed = await Orders.findOne(filter).lean();

    return res.status(200).json({
      success: true,
      message: "Order updated successfully",
      result: refreshed,
    });
  } catch (error) {
    console.error("Error updating order:", error);
    res
      .status(500)
      .json({ success: false, message: "Error updating order", error: error.message });
  }
});

/* ----------------------- LISTS (paginated + projected) ----------------------- */

// common projections for list cards
const LIST_PROJ = {
  Order_uuid: 1,
  Order_Number: 1,
  Customer_uuid: 1,
  Items: 1,
  Status: 1,
  createdAt: 1,
  updatedAt: 1,
};

// delivered OR cancel detection
const matchNotDeliveredOrCancelled = {
  Status: {
    $not: {
      $elemMatch: {
        Task: { $in: ["Delivered", "Cancel"] },
      },
    },
  },
};

router.get("/GetOrderList", async (req, res) => {
  try {
    const { page, limit, skip } = getPaging(req);
    const searchMatch = buildSearchMatch(req.query.q);

    const match = { ...matchNotDeliveredOrCancelled, ...searchMatch };

    const [rows, count] = await Promise.all([
      Orders.find(match, LIST_PROJ).sort({ Order_Number: -1 }).skip(skip).limit(limit).lean(),
      Orders.countDocuments(match),
    ]);

    res.json({ success: true, page, limit, total: count, result: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// helper: delivered match
const deliveredMatch = { Status: { $elemMatch: { Task: "Delivered" } } };

router.get("/GetDeliveredList", async (req, res) => {
  try {
    const { page, limit, skip } = getPaging(req);
    const searchMatch = buildSearchMatch(req.query.q);

    // delivered AND NO billable line (Items.Amount > 0)
    const match = {
      ...deliveredMatch,
      ...searchMatch,
      $expr: {
        $not: {
          $gt: [
            {
              $size: {
                $filter: {
                  input: { $ifNull: ["$Items", []] },
                  as: "it",
                  cond: { $gt: ["$$it.Amount", 0] },
                },
              },
            },
            0,
          ],
        },
      },
    };

    const [rows, count] = await Promise.all([
      Orders.find(match, LIST_PROJ).sort({ Order_Number: -1 }).skip(skip).limit(limit).lean(),
      Orders.countDocuments(match),
    ]);

    res.json({ success: true, page, limit, total: count, result: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/GetBillList", async (req, res) => {
  try {
    const { page, limit, skip } = getPaging(req);
    const searchMatch = buildSearchMatch(req.query.q);

    // delivered AND HAS billable line
    const match = {
      ...deliveredMatch,
      ...searchMatch,
      Items: { $elemMatch: { Amount: { $gt: 0 } } },
    };

    const [rows, count] = await Promise.all([
      Orders.find(match, LIST_PROJ).sort({ Order_Number: -1 }).skip(skip).limit(limit).lean(),
      Orders.countDocuments(match),
    ]);

    res.json({ success: true, page, limit, total: count, result: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ----------------------- CUSTOMER CHECKS ----------------------- */
router.get("/CheckCustomer/:customerUuid", async (req, res) => {
  const { customerUuid } = req.params;
  try {
    const orderExists = await Orders.findOne({ Customer_uuid: customerUuid }, { _id: 1 }).lean();
    res.json({ exists: !!orderExists });
  } catch (error) {
    console.error("Error checking orders:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
});

router.post("/CheckMultipleCustomers", async (req, res) => {
  try {
    const { ids } = req.body;
    const linked = await Orders.find({ Customer_uuid: { $in: ids } }, { Customer_uuid: 1 })
      .distinct("Customer_uuid");
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

/* ----------------------- REPORTS: VENDOR MISSING (paged) ----------------------- */
router.get("/reports/vendor-missing", async (req, res) => {
  try {
    const { page, limit, skip } = getPaging(req);
    const deliveredOnly = req.query.deliveredOnly === "true";
    const search = (req.query.search || "").trim();

    const match = buildSearchMatch(search);
    if (deliveredOnly) match.Status = { $elemMatch: { Task: "Delivered" } };

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
          Items: 1,
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
      {
        $project: {
          rows: "$data",
          total: { $ifNull: [{ $arrayElemAt: ["$total.count", 0] }, 0] },
        },
      },
    ];

    const result = await Orders.aggregate(pipeline);
    const { rows = [], total = 0 } = result[0] || {};
    res.json({ page, limit, total, rows });
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
      patch.vendorId = patch.vendorCustomerUuid;
    }
    if ("label" in patch && patch.label) {
      patch.label = String(patch.label).trim();
      patch.normLabel = normLower(patch.label);
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

      step.vendorId = vendorCustomerUuid ?? vendorId ?? step.vendorId ?? null;
      step.vendorName = vendorName ?? step.vendorName ?? null;
      step.costAmount = amount;
      if (plannedDate) step.plannedDate = new Date(plannedDate);

      if (step.posting?.isPosted) {
        await order.save({ session });
        return res.json({
          ok: true,
          message: "Vendor saved. Step already posted.",
          txnId: step.posting.txnId,
        });
      }

      if (amount === 0) {
        step.status = "done";
        step.posting = { isPosted: false, txnId: null, postedAt: null };
        await order.save({ session });
        return res.json({ ok: true, message: "Vendor saved (no posting for 0 amount)." });
      }

      const lines = [
        { Account_id: `${resolvedVendor}`, Type: "Debit", Amount: amount },
        { Account_id: "fdf29a16-1e87-4f57-82d6-6b31040d3f1e", Type: "Credit", Amount: amount },
      ];

      const txnDate = plannedDate ? new Date(plannedDate) : new Date();

      const lastTxn = await Transaction.findOne({}, { Transaction_id: 1 })
        .sort({ Transaction_id: -1 })
        .session(session)
        .lean();
      const nextId = (lastTxn?.Transaction_id || 0) + 1;

      const [txnDoc] = await Transaction.create(
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

      step.posting = { isPosted: true, txnId: txnDoc._id, postedAt: new Date() };
      step.status = "posted";

      await order.save({ session });
      res.json({ ok: true, txnId: txnDoc._id, transactionId: nextId });
    });
  } catch (e) {
    console.error("assign-vendor error:", e);
    res.status(500).json({ ok: false, error: e.message });
  } finally {
    session.endSession();
  }
});

/* ------------------ TOGGLE STEP (add on check, remove on uncheck) ------------------ */
// NOTE: Frontend uncheck currently calls DELETE /orders/:orderId/steps/:stepId (added below).
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
      // ADD
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
    }

    // UNCHECK: remove by uuid OR normLabel OR case-insensitive label
    const pullOr = [];
    if (uuidStr) pullOr.push({ uuid: uuidStr });
    if (label) {
      pullOr.push({ normLabel: labelNorm });
      pullOr.push({ label: new RegExp(`^\\s*${escapeRegex(label)}\\s*$`, "i") });
    }

    const result = await Orders.updateOne(find, { $pull: { Steps: { $or: pullOr } } });
    return res.json({ success: true, updated: result.modifiedCount > 0 });
  } catch (e) {
    console.error("/order/steps/toggle error", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------- NEW: DELETE a specific Step by subdoc _id -------------- */
router.delete("/orders/:orderId/steps/:stepId", async (req, res) => {
  try {
    const { orderId, stepId } = req.params;
    if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(stepId)) {
      return res.status(400).json({ ok: false, error: "Invalid orderId or stepId" });
    }

    const result = await Orders.updateOne(
      { _id: orderId },
      { $pull: { Steps: { _id: stepId } } }
    );

    if (result.modifiedCount === 0) {
      return res.status(404).json({ ok: false, error: "Order/Step not found or already removed" });
    }

    res.json({ ok: true, removed: true });
  } catch (e) {
    console.error("delete step error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
