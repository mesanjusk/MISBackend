const express = require('express');
const router = express.Router();
const Order = require('../Models/order'); // adjust path if needed

// 🔍 GET all orders that use flat fields (not migrated yet)
router.get('/flat', async (req, res) => {
  try {
    const flatOrders = await Order.find({
      $and: [
        { $or: [{ Items: { $exists: false } }, { Items: { $size: 0 } }] },
        { Item: { $exists: true, $ne: null } }
      ]
    });
    res.json(flatOrders);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch flat orders', error: err });
  }
});

// 🔁 PUT: Migrate a single order by ID
router.put('/single/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order || order.Items?.length > 0) {
      return res.status(400).json({ message: 'Already migrated or not found' });
    }

    const { Item, Quantity, Rate, Amount } = order;
    order.Items = [{ Item, Quantity, Rate, Amount }];

    delete order.Item;
    delete order.Quantity;
    delete order.Rate;
    delete order.Amount;

    await order.save();
    res.json({ message: 'Order migrated', order });
  } catch (error) {
    res.status(500).json({ message: 'Migration failed', error });
  }
});

// 🔁 PUT: Migrate multiple orders by ID list
router.put('/bulk', async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ message: 'Invalid payload' });

  try {
    const orders = await Order.find({ _id: { $in: ids } });
    let migrated = [];

    for (let order of orders) {
      if (order.Items?.length > 0) continue;
      const { Item, Quantity, Rate, Amount } = order;
      order.Items = [{ Item, Quantity, Rate, Amount }];
      delete order.Item;
      delete order.Quantity;
      delete order.Rate;
      delete order.Amount;
      await order.save();
      migrated.push(order._id);
    }

    res.json({ message: 'Bulk migration done', migrated });
  } catch (err) {
    res.status(500).json({ message: 'Bulk migration failed', error: err });
  }
});

module.exports = router;
