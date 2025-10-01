// Routers/Order.js
const express = require("express");
const router = express.Router();

const {
  updateStatus,
  getOrderList,
} = require("../Controller/orderController");

// IMPORTANT: This file must be mounted in app.js exactly as:
// app.use("/order", require("./Routers/Order"));

/* ----------------- List route expected by frontend ----------------- */
// GET https://.../order/GetOrderList?page=1&limit=500
router.get("/GetOrderList", getOrderList);

/* --------------- Drag & drop status update endpoints --------------- */
router.post("/updateStatus", updateStatus);
router.put("/updateStatus/:id", updateStatus);

module.exports = router;
