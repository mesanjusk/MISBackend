// Controller/orderController.js
const mongoose = require("mongoose");
const Orders = require("../Models/order");

// ... keep existing code (including updateStatus) ...

/** GET /order/GetOrderList?page=1&limit=500&search=... */
const getOrderList = async (req, res) => {
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
        { Customer_name: rx },         // in case you store a denorm name
        { "Items.Item": rx }
      ];
    }

    // Sort by updated time (latest first)
    const orders = await Orders.find(q).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean();

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
};

/** GET /taskgroup/GetTaskgroupList?page=1&limit=500 */
const getTaskgroupList = async (req, res) => {
  try {
    // If you have a Taskgroup model, use it. If not, return a static list for now.
    // Example with a simple static list including 'Sequence':
    const rows = [
      { Task_group: "Created",   Sequence: 1 },
      { Task_group: "Design",    Sequence: 2 },
      { Task_group: "Printing",  Sequence: 3 },
      { Task_group: "Lamination",Sequence: 4 },
      { Task_group: "Cutting",   Sequence: 5 },
      { Task_group: "Packing",   Sequence: 6 },
      { Task_group: "Dispatch",  Sequence: 7 },
      // Do NOT return Delivered here (frontend adds it as drop-zone)
    ];

    return res.json({
      success: true,
      page: 1,
      limit: rows.length,
      result: rows,
    });
  } catch (err) {
    console.error("GetTaskgroupList error:", err);
    return res.status(500).json({ success: false, message: err.message || "Server error" });
  }
};

module.exports = {
  // existing exports ...
  updateOrderStatus,
  updateStatus,

  // NEW:
  getOrderList,
  getTaskgroupList,
};
