const express = require("express");
const router = express.Router();
const Customers = require("../Models/customer");
const { v4: uuid } = require("uuid");

// Add customer
router.post("/addCustomer", async (req, res) => {
    const { Customer_name, Mobile_number, Customer_group, Status, Tags, LastInteraction } = req.body;

    try {
        const check = await Customers.findOne({ Mobile_number });

        if (check) {
            return res.status(400).json({ success: false, message: "Mobile number already exists" });
        }

        const newCustomer = new Customers({
            Customer_name,
            Mobile_number,
            Customer_group,
            Status: Status || 'active',  // Default to 'active'
            Tags: Tags || [],
            LastInteraction: LastInteraction || Date.now(),
            Customer_uuid: uuid()
        });

        await newCustomer.save();
        res.status(201).json({ success: true, message: "Customer added successfully" });

    } catch (error) {
        console.error("Error saving customer:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// Get all customers
router.get("/GetCustomersList", async (req, res) => {
    try {
        let data = await Customers.find({});
        if (data.length) {
            res.json({ success: true, result: data });
        } else {
            res.status(404).json({ success: false, message: "No customers found" });
        }
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// Get a customer by ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const customer = await Customers.findById(id);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found',
            });
        }

        res.status(200).json({
            success: true,
            result: customer,
        });
    } catch (error) {
        console.error('Error fetching customer:', error);
        res.status(500).json({
            success: false,
            message: 'Error fetching customer',
            error: error.message,
        });
    }
});

// Update customer
router.put("/update/:id", async (req, res) => {
    const { id } = req.params;
    const { Customer_name, Mobile_number, Customer_group, Status, Tags, LastInteraction } = req.body;

    try {
        const customer = await Customers.findByIdAndUpdate(id, {
            Customer_name, 
            Mobile_number, 
            Customer_group, 
            Status, 
            Tags, 
            LastInteraction
        }, { new: true });

        if (!customer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        res.json({ success: true, result: customer });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Delete customer
router.delete("/DeleteCustomer/:customerId", async (req, res) => {
    const { customerId } = req.params;

    try {
        const item = await Customers.findByIdAndDelete(customerId);
        if (!item) {
            return res.status(404).json({ success: false, message: 'Customer not found' });
        }
        return res.status(200).json({ success: true, message: 'Customer deleted successfully' });
    } catch (error) {
        return res.status(500).json({ success: false, message: 'Error deleting customer' });
    }
});

module.exports = router;
