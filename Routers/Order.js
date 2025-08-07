const express = require("express");
const router = express.Router();
const Orders = require("../Models/order"); // ✅ Only use this once
const { v4: uuid } = require("uuid");
const { updateOrderStatus } = require('../Controller/orderController');

// ✅ Add Order
router.post("/addOrder", async (req, res) => {
  const {
    Customer_uuid,
    Priority = "Normal",
    Status = [{}],
    Remark,
    Steps = [],
  } = req.body;

  const statusDefaults = {
    Task: "Design",
    Assigned: "Sai",
    Status_number: 1,
    Delivery_Date: new Date().toISOString().split("T")[0],
    CreatedAt: new Date().toISOString().split("T")[0],
  };

  const updatedStatus = Status.map((status) => ({
    ...statusDefaults,
    ...status,
  }));

  if (!updatedStatus[0].Task || !updatedStatus[0].Assigned || !updatedStatus[0].Delivery_Date) {
    return res.status(400).json({
      success: false,
      message: "Task, Assigned, and Delivery_Date fields in Status are required.",
    });
  }

  const flatSteps = Steps.reduce((acc, step) => {
    if (step && typeof step.label === "string") {
      acc.push({ label: step.label, checked: !!step.checked });
    }
    return acc;
  }, []);

  try {
    const lastOrder = await Orders.findOne().sort({ Order_Number: -1 });
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
    res.json({ success: true, message: "Order added successfully" });
  } catch (error) {
    console.error("Error saving order:", error);
    res.status(500).json({ success: false, message: "Failed to add order" });
  }
});

// ✅ Unified tab view API for React frontend
router.get('/all-data', async (req, res) => {
  try {
    const delivered = await Orders.find({ 'Status.Task': 'Delivered' });
    const report = await Orders.find({ 'Status.Task': 'Delivered', Items: { $not: { $size: 0 } } });
    const outstanding = await Orders.find({ 'Status.Task': { $ne: 'Delivered' } });
    const bills = await Orders.find({
      'Status.Task': 'Delivered',
      $or: [{ Items: { $exists: false } }, { Items: { $size: 0 } }]
    });

    res.json({ delivered, report, outstanding, bills });
  } catch (error) {
    console.error('Error generating unified report:', error.message);
    res.status(500).json({ error: 'Failed to load report data' });
  }
});

// ✅ Other routes
router.post('/updateStatus', async (req, res) => {
  const { orderId, newStatus } = req.body;
  const result = await updateOrderStatus(orderId, newStatus);
  res.json(result);
});

router.post('/addStatus', async (req, res) => {
  const { orderId, newStatus } = req.body;
  try {
    const result = await updateOrderStatus(orderId, newStatus);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.put("/updateOrder/:id", async (req, res) => {
  try {
    const { Delivery_Date, ...otherFields } = req.body;
    const [day, month, year] = Delivery_Date.split('-');
    const isoDate = `${year}-${month}-${day}`;

    const updatedOrder = await Orders.findOneAndUpdate(
      { _id: req.params.id },
      { $set: { Delivery_Date: isoDate, ...otherFields } },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ success: false, message: "Order not found" });
    }

    res.json({ success: true, result: updatedOrder });
  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/updateDelivery/:id', async (req, res) => {
  const { id } = req.params;
  const { Customer_uuid, Items, Remark } = req.body;

  try {
    const order = await Orders.findById(id);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    order.Customer_uuid = Customer_uuid;
    order.Items = Items;
    order.Remark = Remark;

    await order.save();
    res.status(200).json({ success: true, message: 'Order updated successfully' });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({ success: false, message: 'Error updating order', error });
  }
});

router.get('/GetOrderList', async (req, res) => {
  try {
    const data = await Orders.find({});
    const filteredData = data.filter(order => {
      const isDelivered = order.Status.some(s =>
        s.Task && s.Task.trim().toLowerCase() === 'delivered'
      );
      const isCancelled = order.Status.some(s =>
        s.Task && s.Task.trim().toLowerCase() === 'cancel'
      );
      return !(isDelivered || isCancelled);
    });
    res.json({ success: true, result: filteredData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/GetDeliveredList", async (req, res) => {
  try {
    const data = await Orders.find({});
    const filtered = data.filter(order => {
      const isDelivered = order.Status.some(s => s.Task?.trim().toLowerCase() === 'delivered');
      return isDelivered && (!order.Items || order.Items.length === 0);
    });
    res.json({ success: true, result: filtered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/GetBillList", async (req, res) => {
  try {
    const data = await Orders.find({});
    const filtered = data.filter(order => {
      const isDelivered = order.Status.some(s => s.Task?.trim().toLowerCase() === 'delivered');
      return isDelivered && order.Items && order.Items.length > 0;
    });
    res.json({ success: true, result: filtered });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/CheckCustomer/:customerUuid', async (req, res) => {
  const { customerUuid } = req.params;
  try {
    const orderExists = await Orders.findOne({ Customer_uuid: customerUuid });
    return res.json({ exists: !!orderExists });
  } catch (error) {
    console.error('Error checking orders:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

router.post('/CheckMultipleCustomers', async (req, res) => {
  try {
    const { ids } = req.body;
    const linkedOrders = await Orders.find({ Customer_id: { $in: ids } }).distinct('Customer_id');
    res.status(200).json({ linkedIds: linkedOrders });
  } catch (err) {
    res.status(500).json({ error: 'Error checking linked orders' });
  }
});

router.get('/:id', async (req, res) => {
  const orderId = req.params.id;
  try {
    const order = await Orders.findById(orderId);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// ✅ Export router at the end (only once)
module.exports = router;
