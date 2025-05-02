const express = require('express');
const router = express.Router();
const Customers = require('../models/Customer'); // Adjust the path if needed

// Route to check for duplicate customer name
router.get('/checkDuplicateName', async (req, res) => {
    const { name } = req.query;
    try {
        const existingCustomer = await Customers.findOne({
            Customer_name: { $regex: `^${name}$`, $options: 'i' } // Case-insensitive check
        });
        
        if (existingCustomer) {
            return res.json({ success: false, message: 'Customer name already exists.' });
        }
        
        return res.json({ success: true });
    } catch (error) {
        console.error('Error checking duplicate name:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Route to add a new customer
router.post('/addCustomer', async (req, res) => {
    const { Customer_name, Mobile_number, Customer_group, Status, Tags, LastInteraction, mobileNumberOptional } = req.body;

    // Check if customer name already exists
    const duplicateCustomer = await Customers.findOne({
        Customer_name: { $regex: `^${Customer_name}$`, $options: 'i' }
    });

    if (duplicateCustomer) {
        return res.json({ success: false, message: 'Customer name already exists.' });
    }

    // Validate mobile number if not optional
    if (!mobileNumberOptional && Mobile_number && !/^\d{10}$/.test(Mobile_number)) {
        return res.json({ success: false, message: 'Please enter a valid 10-digit mobile number.' });
    }

    try {
        const newCustomer = new Customers({
            Customer_name,
            Mobile_number,
            Customer_group,
            Status,
            Tags,
            LastInteraction,
            mobileNumberOptional
        });

        await newCustomer.save();
        res.json({ success: true, message: 'Customer added successfully' });
    } catch (error) {
        console.error('Error adding customer:', error);
        res.status(500).json({ success: false, message: 'Error adding customer' });
    }
});

// Route to edit an existing customer
router.put('/editCustomer/:id', async (req, res) => {
    const { Customer_name, Mobile_number, Customer_group, Status, Tags, LastInteraction, mobileNumberOptional } = req.body;
    const { id } = req.params;

    // Check if the new customer name already exists (excluding the current customer)
    const duplicateCustomer = await Customers.findOne({
        Customer_name: { $regex: `^${Customer_name}$`, $options: 'i' },
        _id: { $ne: id } // Exclude the current customer
    });

    if (duplicateCustomer) {
        return res.json({ success: false, message: 'Customer name already exists.' });
    }

    // Validate mobile number if not optional
    if (!mobileNumberOptional && Mobile_number && !/^\d{10}$/.test(Mobile_number)) {
        return res.json({ success: false, message: 'Please enter a valid 10-digit mobile number.' });
    }

    try {
        const updatedCustomer = await Customers.findByIdAndUpdate(id, {
            Customer_name,
            Mobile_number,
            Customer_group,
            Status,
            Tags,
            LastInteraction,
            mobileNumberOptional
        }, { new: true });

        if (!updatedCustomer) {
            return res.json({ success: false, message: 'Customer not found.' });
        }

        res.json({ success: true, message: 'Customer updated successfully', updatedCustomer });
    } catch (error) {
        console.error('Error updating customer:', error);
        res.status(500).json({ success: false, message: 'Error updating customer' });
    }
});

module.exports = router;
