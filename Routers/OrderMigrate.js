const express = require('express');
const router = express.Router();
const Order = require('../Models/order'); // Adjust if path is different

// 🔍 Get all old orders with flat fields (not yet migrated)
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

// 🔁 Migrate a single order
router.put('/single/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order || order.Items?.length > 0) {
      return res.status(400).json({ message: 'Already migrated or not found' });
    }

    const { Item, Quantity, Rate, Amount } = order;
    order.Items = [{ Item, Quantity, Rate, Amount }];

    if (!order.Steps || order.Steps.length === 0) {
      order.Steps = [
        { label: 'Design Approved', checked: false },
        { label: 'Printing Done', checked: false },
        { label: 'Cutting Done', checked: false },
        { label: 'Delivered', checked: false }
      ];
    }

    // ✅ Properly remove flat fields
    order.set('Item', undefined, { strict: false });
    order.set('Quantity', undefined, { strict: false });
    order.set('Rate', undefined, { strict: false });
    order.set('Amount', undefined, { strict: false });

    await order.save();
    res.json({ message: 'Order migrated', order });
  } catch (error) {
    res.status(500).json({ message: 'Migration failed', error });
  }
});

// 🔁 Bulk migrate multiple orders
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

      if (!order.Steps || order.Steps.length === 0) {
        order.Steps = [
          { label: 'Design Approved', checked: false },
          { label: 'Printing Done', checked: false },
          { label: 'Cutting Done', checked: false },
          { label: 'Delivered', checked: false }
        ];
      }

      // ✅ Properly remove flat fields
      order.set('Item', undefined, { strict: false });
      order.set('Quantity', undefined, { strict: false });
      order.set('Rate', undefined, { strict: false });
      order.set('Amount', undefined, { strict: false });

      await order.save();
      migrated.push(order._id);
    }

    res.json({ message: 'Bulk migration done', migrated });
  } catch (err) {
    res.status(500).json({ message: 'Bulk migration failed', error: err });
  }
});

module.exports = router;
