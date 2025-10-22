const mongoose = require("mongoose");
const Orders = require("../Models/order");

const coerceDate = (value, fallback) => {
  if (!value) return fallback;
  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? fallback : dt;
};

const buildOrderFilter = (identifier) => {
  if (!identifier) return null;

  if (typeof identifier === "object" && !Array.isArray(identifier)) {
    return identifier;
  }

  const options = [];

  if (typeof identifier === "string") {
    const trimmed = identifier.trim();
    if (trimmed) {
      options.push({ Order_uuid: trimmed });

      const asNumber = Number(trimmed);
      if (!Number.isNaN(asNumber)) {
        options.push({ Order_Number: asNumber });
      }
    }
  }

  if (mongoose.isValidObjectId(identifier)) {
    options.push({ _id: identifier });
  }

  if (options.length === 0) return null;
  return options.length === 1 ? options[0] : { $or: options };
};

const normalizeStatusPayload = (incoming = {}, order) => {
  const asObject =
    incoming && typeof incoming === "object" && !Array.isArray(incoming)
      ? { ...incoming }
      : { Task: incoming };

  const lastStatus = Array.isArray(order?.Status) && order.Status.length > 0
    ? order.Status[order.Status.length - 1]
    : {};

  const rawTask = asObject.Task ?? asObject.task;
  const task = typeof rawTask === "string" ? rawTask.trim() : "";
  if (!task) {
    return { error: "Task is required" };
  }

  const assignedRaw = asObject.Assigned ?? asObject.assigned;
  const assigned =
    typeof assignedRaw === "string" && assignedRaw.trim()
      ? assignedRaw.trim()
      : typeof lastStatus?.Assigned === "string" && lastStatus.Assigned.trim()
        ? lastStatus.Assigned
        : "Unassigned";

  const now = new Date();

  const deliveryRaw = asObject.Delivery_Date ?? asObject.deliveryDate;
  const createdRaw = asObject.CreatedAt ?? asObject.createdAt;

  const deliveryDate = coerceDate(deliveryRaw, lastStatus?.Delivery_Date ?? now);
  const createdAt = coerceDate(createdRaw, now);

  return {
    Task: task,
    Assigned: assigned,
    Delivery_Date: deliveryDate,
    CreatedAt: createdAt,
  };
};

const updateOrderStatus = async ({ identifier, statusInput }) => {
  try {
    const filter = buildOrderFilter(identifier);
    if (!filter) {
      return { success: false, message: "Invalid order identifier" };
    }

    const order = await Orders.findOne(filter);
    if (!order) {
      return { success: false, message: "Order not found" };
    }

    const normalized = normalizeStatusPayload(statusInput, order);
    if (normalized?.error) {
      return { success: false, message: normalized.error };
    }

    const statusNumbers = Array.isArray(order.Status)
      ? order.Status.map((s) => Number(s.Status_number) || 0)
      : [];
    const maxStatusNumber = statusNumbers.length > 0 ? Math.max(...statusNumbers) : 0;

    order.Status.push({
      ...normalized,
      Status_number: maxStatusNumber + 1,
    });

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

