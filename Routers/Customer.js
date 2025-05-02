const express = require('express');
const router = express.Router();
const Customer = require('../Models/customer');

// POST: Add a new customer
router.post('/AddCustomer', async (req, res) => {
  try {
    const { name, mobile, group, status, lastInteraction, tags } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Customer name is required' });
    }

    // Check if customer with the same name exists
    const existing = await Customer.findOne({ name: name.trim() });
    if (existing) {
      return res.status(409).json({ error: 'Customer with this name already exists' });
    }

    const newCustomer = new Customer({
      name: name.trim(),
      mobile,
      group,
      status,
      lastInteraction,
      tags
    });

    const savedCustomer = await newCustomer.save();
    res.status(201).json(savedCustomer);
  } catch (err) {
    console.error('Error saving customer:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
