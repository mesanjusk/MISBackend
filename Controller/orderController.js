// Controller/orderController.js
const mongoose = require("mongoose");
const Orders = require("../Models/order");

// normalize
const norm = (s) => String(s || "").trim();
const isObjectId = (v) => mongoose.isValidObjectId(v);

/**
 * Core helper: append a new Status entry (computes next Status_number).
 * - orderIdOrUuid: Mongo _id OR Order_uuid
 * - task: string (e.g., "Design", "Printing", "Delivered", ...)
 */
const updateOrderStatus = async (orderIdOrUuid, task) => {
  try {
    const id = norm(orderIdOrUuid);
    const Task = norm(task);
    if (!id) return { success: false, message: "Order id is required" };
    if (!Task) return { success: false, message: "Task is required" };

    // find by _id or Order_uuid
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

    // work out next Status_number
    const nextNo = typeof order.nextStatusNumber === "function"
      ? order.nextStatusNumber()
      : (() => {
          const arr = Array.isArray(order.Status) ? order.Status : [];
          if (arr.length === 0) return 1;
          return Math.max(...arr.map((s) => Number(s?.Status_number || 0))) + 1;
        })();

    // reuse last Assigned & Delivery_Date to satisfy required fields in statusSchema
    const last = (Array.isArray(order.Status) && order.Status.length > 0)
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
};

/**
 * Express route handler:
 *  - POST /order/updateStatus       body: { Order_id, Task }
 *  - PUT  /order/updateStatus/:id   body: { Task }
 *  - (Backward compatible) body: { orderId, newStatus: { Task } }
 */
const updateStatus = async (req, res) => {
  try {
    // accept multiple shapes
    const id = req.params.id || req.body.Order_id || req.body.orderId;
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
    return res.status(500).json({ success: false, message: err?.message || "Server error" });
  }
};

module.exports = {
  updateOrderStatus, // programmatic use
  updateStatus       // route handler
};
