const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Orders = require("../Models/order");
const Transaction = require("../Models/transaction");
const { v4: uuid } = require("uuid");
const { updateOrderStatus } = require("../Controller/orderController");

/* ----------------------- CREATE NEW ORDER ----------------------- */
router.post("/addOrder", async (req, res) => {
  const { Customer_uuid, Priority = "Normal", Status = [{}], Remark, Steps = [] } = req.body;

  const now = new Date();
  const statusDefaults = { Task: "Design", Assigned: "Sai", Status_number: 1, Delivery_Date: now, CreatedAt: now };

  const updatedStatus = (Status || []).map((s) => ({
    ...statusDefaults,
    ...s,
    Delivery_Date: s?.Delivery_Date ? new Date(s.Delivery_Date) : now,
    CreatedAt: s?.CreatedAt ? new Date(s.CreatedAt) : now,
  }));

  if (!updatedStatus[0]?.Task || !updatedStatus[0]?.Assigned || !updatedStatus[0]?.Delivery_Date) {
    return res
      .status(400)
      .json({ success: false, message: "Task, Assigned, and Delivery_Date are required in Status[0]." });
  }

  const flatSteps = (Steps || []).reduce((acc, step) => {
    if (step && typeof step.label === "string") {
      acc.push({
        label: step.label,
        checked: !!step.checked,
        vendorId: step.vendorId ?? null,
        vendorCustomerUuid: step.vendorCustomerUuid ?? null, // keep both for safety
        vendorName: step.vendorName ?? null,
        costAmount: Number(step.costAmount ?? 0),
        plannedDate: step.plannedDate ? new Date(step.plannedDate) : undefined,
        status: step.status || "pending",
        posting: step.posting || { isPosted: false, txnId: null, postedAt: null },
      });
    }
    return acc;
  }, []);

  try {
    const lastOrder = await Orders.findOne().sort({ Order_Number: -1 }).lean();
    const newOrderNumber = lastOrder ? lastOrder.Order_Number + 1 : 1;

    const newOrder = new Orders({
      Order_uuid: uuid(),
      Order_Number: newOrderNumber,
      Customer_uuid,
      Priority,
      Status: updatedStatus,
      Steps: flatSteps,
      Remark,
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

/* ----------------------- UNIFIED VIEW (unchanged) ----------------------- */
router.get("/all-data", async (req, res) => {
  try {
    const delivered = await Orders.find({ Status: { $elemMatch: { Task: "Delivered" } } });
    const report = await Orders.find({
      Status: { $elemMatch: { Task: "Delivered" } },
      Items: { $exists: true, $not: { $size: 0 } },
    });
    const outstanding = await Orders.find({ Status: { $not: { $elemMatch: { Task: "Delivered" } } } });

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
          Remark: 1,
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

/* ----------------------- NEW: RAW FEED for AllVendors (no filtering) ----------------------- */
/** Returns minimal data; let frontend filter/search/project. */
router.get("/allvendors-raw", async (req, res) => {
  try {
    // No filtering here; return lean/minimal for client-side work
    const docs = await Orders.find(
      {},
      {
        Order_Number: 1,
        Customer_uuid: 1,
        Remark: 1,
        Steps: 1,
      }
    )
      .sort({ Order_Number: -1 })
      .lean();

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
      match.$or = [
        { Order_Number: isNaN(+search) ? -1 : +search },
        { Customer_uuid: new RegExp(search, "i") },
        { Remark: new RegExp(search, "i") },
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
          Remark: 1,
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

/* ----------------------- UPDATE ORDER ----------------------- */
router.put("/updateOrder/:id", async (req, res) => {
  try {
    const { Delivery_Date, ...otherFields } = req.body;
    const updateDoc = { ...otherFields };

    if (Delivery_Date) {
      const order = await Orders.findById(req.params.id);
      if (!order) return res.status(404).json({ success: false, message: "Order not found" });

      const lastIndex = (order.Status?.length || 1) - 1;
      if (lastIndex >= 0) {
        order.Status[lastIndex].Delivery_Date = new Date(Delivery_Date);
        Object.assign(order, otherFields);
        const saved = await order.save();
        return res.json({ success: true, result: saved });
      }
    }

    const updatedOrder = await Orders.findOneAndUpdate({ _id: req.params.id }, { $set: updateDoc }, { new: true });
    if (!updatedOrder) return res.status(404).json({ success: false, message: "Order not found" });
    res.json({ success: true, result: updatedOrder });
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ----------------------- UPDATE DELIVERY (Items) ----------------------- */
router.put("/updateDelivery/:id", async (req, res) => {
  const { id } = req.params;
  const { Customer_uuid, Items, Remark } = req.body;
  try {
    const order = await Orders.findById(id);
    if (!order) return res.status(404).json({ success: false, message: "Order not found" });
    order.Customer_uuid = Customer_uuid ?? order.Customer_uuid;
    order.Items = Array.isArray(Items) ? Items : order.Items;
    order.Remark = Remark ?? order.Remark;
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
      const delivered = o.Status?.some((s) => s.Task?.trim().toLowerCase() === "delivered");
      const cancelled = o.Status?.some((s) => s.Task?.trim().toLowerCase() === "cancel");
      return !(delivered || cancelled);
    });
    res.json({ success: true, result: filteredData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/GetDeliveredList", async (req, res) => {
  try {
    const data = await Orders.find({});
    const filtered = data.filter((o) => {
      const delivered = o.Status?.some((s) => s.Task?.trim().toLowerCase() === "delivered");
      return delivered && (!o.Items || o.Items.length === 0);
    });
    res.json({ success: true, result: filtered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Deprecated, kept for backward compatibility
router.get("/GetBillList", async (req, res) => {
  try {
    const data = await Orders.find({});
    const filtered = data.filter((o) => {
      const delivered = o.Status?.some((s) => s.Task?.trim().toLowerCase() === "delivered");
      return delivered && o.Items && o.Items.length > 0;
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

/* ----------------------- REPORTS: VENDOR MISSING (kept) ----------------------- */
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
      match.$or = [
        { Order_Number: isNaN(+search) ? -1 : +search },
        { Customer_uuid: new RegExp(search, "i") },
        { Remark: new RegExp(search, "i") },
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
          Remark: 1,
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

/* ------------------ NEW: CREATE STEP (append missing step) ------------------ */
router.post("/orders/:orderId/steps", async (req, res) => {
  const { orderId } = req.params;
  const {
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
      label,
      checked: !!checked,
      vendorId: vendorCustomerUuid ?? vendorId ?? null,
      vendorCustomerUuid: vendorCustomerUuid ?? null,
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

/* ----------- NEW: EDIT STEP (no posting/transaction side effects) ----------- */
router.patch("/orders/:orderId/steps/:stepId", async (req, res) => {
  const { orderId, stepId } = req.params;
  const allowed = ["label", "vendorId", "vendorCustomerUuid", "vendorName", "costAmount", "plannedDate", "status", "checked"];
  const patch = {};

  for (const k of allowed) if (k in req.body) patch[k] = req.body[k];

  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ ok: false, error: "Order not found" });

    const step = order.Steps.id(stepId);
    if (!step) return res.status(404).json({ ok: false, error: "Step not found" });

    if ("plannedDate" in patch && patch.plannedDate) patch.plannedDate = new Date(patch.plannedDate);
    if ("costAmount" in patch) patch.costAmount = Number(patch.costAmount || 0);

    Object.assign(step, patch);

    await order.save();
    res.json({ ok: true, step });
  } catch (e) {
    console.error("edit step error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ************* ASSIGN VENDOR & POST (kept, uses “purchase”) ************* */
router.post("/orders/:orderId/steps/:stepId/assign-vendor", async (req, res) => {
  const { orderId, stepId } = req.params;
  const { vendorId, vendorName, vendorCustomerUuid, costAmount, plannedDate, createdBy } = req.body;

  const resolvedVendor = vendorId || vendorCustomerUuid || vendorName;
  if (!resolvedVendor) return res.status(400).json({ ok: false, error: "Provide vendorId or vendorCustomerUuid or vendorName" });

  const amount = Number(costAmount ?? 0);
  if (Number.isNaN(amount) || amount < 0) return res.status(400).json({ ok: false, error: "Invalid costAmount" });

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
        return res.json({ ok: true, message: "Vendor saved. Step already posted.", txnId: step.posting.txnId });
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
        { Account_id: "fdf29a16-1e87-4f57-82d6-6b31040d3f1e", Type: "Credit", Amount: amount },
      ];

      const txnDate = plannedDate ? new Date(plannedDate) : new Date();

      const lastTxn = await Transaction.findOne({}, { Transaction_id: 1 }).sort({ Transaction_id: -1 }).session(session).lean();
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

module.exports = router;
