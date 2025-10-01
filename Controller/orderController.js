// Controller/orderController.js
const mongoose = require("mongoose");
const Orders = require("../Models/order");

const isObjectId = (v) => mongoose.isValidObjectId(v);
const norm = (s) => String(s || "").trim();

/**
 * Core helper: append a new Status entry (computes next Status_number).
 * Accepts Mongo _id OR Order_uuid.
 */
async function updateOrderStatus(orderIdOrUuid, task) {
  try {
    const id = norm(orderIdOrUuid);
    const Task = norm(task);

    if (!id) return { success: false, message: "Order id is required" };
    if (!Task) return { success: false, message: "Task is required" };

    // Find by _id or Order_uuid
    let order = null;
    if (isObjectId(id)) {
      order = await Orders.findById(id);
    }
    if (!order) {
      order = await Orders.findOne({ Order_uuid: id });
    }
    if (!order) {
      return { success: false, message: "Order not found" };
    }

    // Next Status_number
    const nextNo = typeof order.nextStatusNumber === "function"
      ? order.nextStatusNumber()
      : (() => {
          const arr = Array.isArray(order.Status) ? order.Status : [];
          if (arr.length === 0) return 1;
          return Math.max(...arr.map((s) => Number(s?.Status_number || 0))) + 1;
        })();

    // Reuse last Assigned & Delivery_Date to satisfy status schema (required)
    const last = Array.isArray(order.Status) && order.Status.length
      ? order.Status[order.Status.length - 1]
      : null;

    const Assigned = norm(last?.Assigned || "System");
    const Delivery_Date = last?.Delivery_Date ? new Date(last.Delivery_Date) : new Date();
    const CreatedAt = new Date();

    const newStatus = { Task, Assigned, Delivery_Date, Status_number: nextNo, CreatedAt };

    const updatedOrder = await Orders.findByIdAndUpdate(
      order._id,
      { $push: { Status: newStatus } },
      { new: true }
    );

    if (!updatedOrder) {
      return { success: false, message: "Order not found after update" };
    }

    return {
      success: true,
      message: "Status updated",
      result: updatedOrder,
      highestStatusTask: newStatus
    };
  } catch (error) {
    console.error("Error updating order status:", error);
    return { success: false, message: "Error updating order status" };
  }
}

/**
 * Route: POST /order/updateStatus (body: { Order_id, Task })
 *        PUT  /order/updateStatus/:id (body: { Task })
 * (Back-compat) also accepts { orderId, newStatus: { Task } }
 */
async function updateStatus(req, res) {
  try {
    const id =
      req.params.id ||
      req.body.Order_id ||
      req.body.orderId ||
      "";

    const Task =
      (req.body.Task ?? req.body.task) ??
      (req.body.newStatus && req.body.newStatus.Task) ??
      "";

    const out = await updateOrderStatus(id, Task);
    if (!out.success) {
      const code = /not found/i.test(out.message) ? 404 : 400;
      return res.status(code).json(out);
    }
    return res.json(out);
  } catch (err) {
    console.error("updateStatus handler error:", err);
    return res
      .status(500)
      .json({ success: false, message: err?.message || "Server error" });
  }
}

/**
 * Route: GET /order/GetOrderList?page=1&limit=500&search=...
 * (kept minimal to match frontend needs)
 */
async function getOrderList(req, res) {
  try {
    const page  = Math.max(parseInt(req.query.page  || "1", 10), 1);
    const limit = Math.max(parseInt(req.query.limit || "50", 10), 1);
    const skip  = (page - 1) * limit;
    const search = (req.query.search || "").trim();

    const q = {};
    if (search) {
      const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      q.$or = [
        { Order_Number: rx },
        { Customer_name: rx },
        { "Items.Item": rx },
      ];
    }

    const orders = await Orders.find(q)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      page,
      limit,
      count: orders.length,
      result: orders,
    });
  } catch (err) {
    console.error("GetOrderList error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
}

module.exports = {
  // keep function names identical to what Routers/Order.js imports
  updateOrderStatus,
  updateStatus,
  getOrderList,
};
