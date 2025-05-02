const express = require('express');
const router = express.Router();
const Customers = require('../models/Customer');  // Adjusted import path

// Add a new customer
router.post('/add', async (req, res) => {
    try {
        const { Customer_name, Mobile_number, Customer_group, Status, Tags, LastInteraction } = req.body;

        // Check for duplicate customer names
        const existingCustomer = await Customers.findOne({ Customer_name });
        if (existingCustomer) {
            return res.status(400).json({ message: "Customer with this name already exists!" });
        }

        // If mobile number is provided, ensure it's valid and unique
        if (Mobile_number) {
            const existingMobile = await Customers.findOne({ Mobile_number });
            if (existingMobile) {
                return res.status(400).json({ message: "Customer with this mobile number already exists!" });
            }
        }

        // Create new customer record
        const newCustomer = new Customers({
            Customer_name,
            Mobile_number,
            Customer_group,
            Status,
            Tags,
            LastInteraction
        });

        await newCustomer.save();
        res.status(201).json(newCustomer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error adding customer" });
    }
});

// Edit an existing customer
router.put('/edit/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { Customer_name, Mobile_number, Customer_group, Status, Tags, LastInteraction } = req.body;

        // Check for duplicate customer names
        const existingCustomer = await Customers.findOne({ Customer_name, _id: { $ne: id } });
        if (existingCustomer) {
            return res.status(400).json({ message: "Customer with this name already exists!" });
        }

        // If mobile number is provided, ensure it's valid and unique
        if (Mobile_number) {
            const existingMobile = await Customers.findOne({ Mobile_number, _id: { $ne: id } });
            if (existingMobile) {
                return res.status(400).json({ message: "Customer with this mobile number already exists!" });
            }
        }

        // Update customer details
        const updatedCustomer = await Customers.findByIdAndUpdate(id, {
            Customer_name,
            Mobile_number,
            Customer_group,
            Status,
            Tags,
            LastInteraction
        }, { new: true });

        if (!updatedCustomer) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.status(200).json(updatedCustomer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error updating customer" });
    }
});

// Get all customers
router.get('/', async (req, res) => {
    try {
        const customers = await Customers.find();
        res.status(200).json(customers);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching customers" });
    }
});

// Get a single customer by ID
router.get('/:id', async (req, res) => {
    try {
        const customer = await Customers.findById(req.params.id);
        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        res.status(200).json(customer);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: "Error fetching customer" });
    }
});

module.exports = router;
