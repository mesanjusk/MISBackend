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

router.post('/CheckMultipleCustomers', async (req, res) => {
    try {
        const { ids } = req.body;
        const linkedOrders = await Order.find({ Customer_id: { $in: ids } }).distinct('Customer_id');
        res.status(200).json({ linkedIds: linkedOrders });
    } catch (err) {
        res.status(500).json({ error: 'Error checking linked orders' });
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
        const isMainAmount = order.Amount === 0;

        const isStatusDelivered = order.Status.some(
          status => status.Task && status.Task.trim().replace(/\s+/g, '').toLowerCase() === "delivered"
        );

        return (isMainTaskDelivered || isStatusDelivered) && isMainAmount;
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

router.get("/GetBillList", async (req, res) => {
  try {
    let data = await Orders.find({});

    if (data.length) {
      const filteredData = data.filter(order => {
        const mainTask = order.Task ? order.Task.trim().replace(/\s+/g, '').toLowerCase() : "";
        const isMainTaskDelivered = mainTask === "delivered";
        const isMainAmount = order.Amount !== 0;

        const isStatusDelivered = order.Status.some(
          status => status.Task && status.Task.trim().replace(/\s+/g, '').toLowerCase() === "delivered"
        );

        return (isMainTaskDelivered || isStatusDelivered) && isMainAmount;
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

router.get('/:id', async (req, res) => {
  const orderId = req.params.id;  

  try {
    const order = await Orders.findById(orderId);  
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json(order);
  } catch (error) {
    console.error('Error retrieving order:', error);
    res.status(500).json({ message: 'Server error' });
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
  const { Customer_uuid, Item, Quantity, Rate, Amount,Remark } = req.body;

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
      order.Remark = Remark;

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

 router.put("/update/:id", async (req, res) => {
    const { id } = req.params;
    const { Customer_uuid } = req.body;

    try {
      const user = await Orders.findOneAndUpdate(
        { Order_uuid: id }, 
        { Customer_uuid },
        { new: true }
    );
    

        if (!user) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }

        res.json({ success: true, result: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

  module.exports = router;
