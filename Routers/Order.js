const express = require("express");
const router = express.Router();
const Orders = require("../Models/order");
const { v4: uuid } = require("uuid");
const { updateOrderStatus } = require('../Controller/orderController');

router.post('/updateStatus', async (req, res) => {
  const { orderId, newStatus } = req.body;
  const result = await updateOrderStatus(orderId, newStatus);
  res.json(result);
});


router.post("/addOrder", async (req, res) => {
  const {
    Customer_uuid,
    Priority = "Normal", 
    Item = "New Order",  
    Status = [{}],
    Remark,
  } = req.body;

  const statusDefaults = {
    Task: "Design",
    Assigned: "Sai",
    Status_number: 1,
    Delivery_Date: new Date().toISOString().split("T")[0], 
    CreatedAt: new Date().toISOString().split("T")[0]
  };

  const updatedStatus = Status.map((status) => ({
    ...statusDefaults,
    ...status, 
  }));

  if (
    !updatedStatus[0].Task ||
    !updatedStatus[0].Assigned ||
    !updatedStatus[0].Delivery_Date
  ) {
    return res
      .status(400)
      .json({
        success: false,
        message: "Task, Assigned, and Delivery_Date fields in Status are required.",
      });
  }

  try {
  
    const lastOrder = await Orders.findOne().sort({ Order_Number: -1 });
    const newOrderNumber = lastOrder ? lastOrder.Order_Number + 1 : 1;

    const newOrder = new Orders({
      Order_uuid: uuid(),
      Order_Number: newOrderNumber,
      Customer_uuid,
      Priority,
      Item,
      Status: updatedStatus, 
      Remark,
    });

    await newOrder.save();
    res.json({ success: true, message: "Order added successfully" });
  } catch (error) {
    console.error("Error saving order:", error);
    res.status(500).json({ success: false, message: "Failed to add order" });
  }
});


router.get("/GetOrderList", async (req, res) => {
  try {
   
    let data = await Orders.find({});

    if (data.length) {
   
      const filteredData = data.filter(order => {
      
        const mainTask = order.Task ? order.Task.trim().replace(/\s+/g, '').toLowerCase() : "";

       
        const isMainTaskDelivered = mainTask === "Delivered";
        const isMainTaskCancel = mainTask === "Cancel";
        
      
        const isStatusDelivered = order.Status.some(
          status => status.Task && status.Task.trim().replace(/\s+/g, '').toLowerCase() === "delivered"
        );

        const isStatusCancel = order.Status.some(
          status => status.Task && status.Task.trim().replace(/\s+/g, '').toLowerCase() === "cancel"
        );

        return !(isMainTaskDelivered || isStatusDelivered || isMainTaskCancel || isStatusCancel);
       
      });


      res.json({ success: true, result: filteredData });
    } else {
      res.json({ success: false, message: "Order not found" });
    }
  } catch (err) {
    
    console.error("Error fetching orders:", err);

   
    res.status(500).json({ success: false, message: err.message || 'An unknown error occurred' });
  }
});

router.get("/GetDeliveredList", async (req, res) => {
  try {
    let data = await Orders.find({});

    if (data.length) {
      const filteredData = data.filter(order => {
        const mainTask = order.Task ? order.Task.trim().replace(/\s+/g, '').toLowerCase() : "";
        const isMainTaskDelivered = mainTask === "delivered";

        const isStatusDelivered = order.Status.some(
          status => status.Task && status.Task.trim().replace(/\s+/g, '').toLowerCase() === "delivered"
        );

        return isMainTaskDelivered || isStatusDelivered;
      });

      res.json({ success: true, result: filteredData });
    } else {
      res.json({ success: false, message: "No orders found" });
    }
  } catch (err) {
    console.error("Error fetching orders:", err);
    res.status(500).json({ success: false, message: 'Internal Server Error', details: err.message });
  }
});



  router.get("/:id", async(req, res) => {
    const orderId = req.params.id;

    try {
      const order = await Orders.findById(orderId);

      if (!order) {
          return res.status(404).send({ success: false, message: "Order not found" });
      }

      return res.send({ success: true, result: order });
  } catch (err) {
      console.error("Error retrieving order:", err);
      return res.status(500).send({ success: false, message: "Internal Server Error" });
  }
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
  const { Customer_uuid, Item, Quantity, Rate, Amount } = req.body;

  try {
      const order = await Orders.findById(id);
      if (!order) {
          return res.status(404).json({ success: false, message: 'Order not found' });
      }

      order.Customer_uuid = Customer_uuid;
      order.Item = Item;
      order.Quantity = Quantity;
      order.Rate = Rate;
      order.Amount = Amount;

      await order.save();
      res.status(200).json({ success: true, message: 'Order updated successfully' });
  } catch (error) {
      console.log('Error updating order:', error);
      res.status(500).json({ success: false, message: 'Error updating order', error });
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


  module.exports = router;