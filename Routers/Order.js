// Routers/Order.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Orders = require("../Models/order");
const Transaction = require("../Models/transaction");
const { v4: uuid } = require("uuid");

// ⬇⬇⬇ NEW: import the unified controller
const { updateStatus } = require("../Controller/orderController");

/* ----------------------- helpers ----------------------- */
const norm = (s) => String(s || "").trim();
const normLower = (s) => String(s || "").trim().toLowerCase();
const toDate = (v, fallback = new Date()) => (v ? new Date(v) : fallback);
const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// (… keep the rest of the helpers and all existing routes exactly as you have …)

/* ----------------------- STATUS APIs (updated) ----------------------- */
// Frontend will first try POST /order/updateStatus with { Order_id, Task }
// and may fallback to PUT /order/updateStatus/:id with { Task }
// We accept previous shape { orderId, newStatus: { Task } } as well.

router.post("/updateStatus", updateStatus);
router.put("/updateStatus/:id", updateStatus);

/* ----------------------- CREATE NEW ORDER ----------------------- */
// (keep your existing /addOrder route as-is; unchanged)
// (… FULL existing file content …)

// NOTE: The rest of your routes remain unchanged.
// We did not touch /GetOrderList, /GetDeliveredList, etc., because your
// frontend already relies on those and they’re compatible with the new board.

module.exports = router;
