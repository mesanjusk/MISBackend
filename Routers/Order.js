// Routers/Order.js
const express = require("express");
const router = express.Router();

const {
  updateStatus,
  getOrderList,       // <-- add import
  getTaskgroupList,   // <-- add import
} = require("../Controller/orderController");

// ... keep existing routes ...

// EXACT paths expected by frontend:
router.get("/GetOrderList", getOrderList);
router.get("/taskgroup/GetTaskgroupList", getTaskgroupList);

// Status update routes:
router.post("/updateStatus", updateStatus);
router.put("/updateStatus/:id", updateStatus);

module.exports = router;
