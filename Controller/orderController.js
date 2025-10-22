const mongoose = require("mongoose");
const Orders = require("../Models/order");

function buildOrderFilter(identifier) {
  if (!identifier) return null;

  if (typeof identifier === "object" && !Array.isArray(identifier)) {
    return identifier;
  }

  const trimmed = String(identifier).trim();
  const queries = [];

  if (trimmed) {
    queries.push({ Order_uuid: trimmed });

    const asNumber = Number(trimmed);
    if (!Number.isNaN(asNumber)) {
      queries.push({ Order_Number: asNumber });
    }
  }

  if (mongoose.isValidObjectId(identifier)) {
    queries.push({ _id: identifier });
  }

  if (queries.length === 0) return null;
  return queries.length === 1 ? queries[0] : { $or: queries };
}

function coerceDate(value, fallback) {
  if (!value) return fallback;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? fallback : dt;
}

function normalizeStatusInput(rawStatus, currentStatuses) {
  const lastStatus = Array.isArray(currentStatuses)
    ? currentStatuses[currentStatuses.length - 1] || {}
    : {};

  let status = {};
  if (typeof rawStatus === "string") {
    status.Task = rawStatus.trim();
  } else if (rawStatus && typeof rawStatus === "object" && !Array.isArray(rawStatus)) {
    status = { ...rawStatus };
  }

  const task = typeof status.Task === "string" ? status.Task.trim() : "";
  if (!task) {
    return { error: "Task is required" };
  }

  const assignedSource =
    typeof status.Assigned === "string" && status.Assigned.trim()
      ? status.Assigned.trim()
      : typeof lastStatus.Assigned === "string" && lastStatus.Assigned.trim()
        ? lastStatus.Assigned
        : "Unassigned";

  const now = new Date();

  return {
    Task: task,
    Assigned: assignedSource,
    Delivery_Date: coerceDate(status.Delivery_Date, lastStatus.Delivery_Date ?? now),
    CreatedAt: coerceDate(status.CreatedAt, now),
  };
}

const updateOrderStatus = async (identifier, statusInput) => {
  try {
    const filter = buildOrderFilter(identifier);
    if (!filter) {
      return { success: false, message: "Invalid order identifier" };
    }

    const order = await Orders.findOne(filter);
    if (!order) {
      return { success: false, message: "Order not found" };
    }

    order.Status = Array.isArray(order.Status) ? order.Status : [];
    const normalizedStatus = normalizeStatusInput(statusInput, order.Status);
    if (normalizedStatus?.error) {
      return { success: false, message: normalizedStatus.error };
    }

    const maxStatusNumber = order.Status.reduce((acc, status) => {
      const value = Number(status.Status_number);
      return Number.isNaN(value) ? acc : Math.max(acc, value);
    }, 0);

    const nextStatus = {
      ...normalizedStatus,
      Status_number: maxStatusNumber + 1,
    };

    order.Status.push(nextStatus);
    const saved = await order.save();

    return { success: true, result: saved };
  } catch (error) {
    console.error("Error updating order status:", error);
    return { success: false, message: "Error updating order status" };
  }
};

module.exports = {
  updateOrderStatus,
};
