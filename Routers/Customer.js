const express = require("express");
const router = express.Router();
const Customers = require("../Models/customer");
const { v4: uuid } = require("uuid");
const Transaction = require("../Models/transaction");
const Order = require("../Models/order");

// Add a new customer
router.post("/addCustomer", async (req, res) => {
    const { Customer_name, Mobile_number, Customer_group, Status, Tags, LastInteraction } = req.body;

    try {
        const check = await Customers.findOne({ Customer_name });

        if (check) {
            return res.status(400).json({ success: false, message: "Customer name already exists" });
        }

        // Handle blank or undefined Mobile_number
        let mobile = Mobile_number && Mobile_number.trim() !== '' ? Mobile_number : null;

        // Create a new customer object
        const newCustomer = new Customers({
            Customer_name,
            Mobile_number: mobile, // Set mobile as null if blank
            Customer_group,
            Status,
            Tags,
            LastInteraction,
            Customer_uuid: uuid()
        });

        await newCustomer.save();
        res.status(201).json({ success: true, message: "Customer added successfully" });

    } catch (error) {
        console.error("Error saving customer:", error);
        res.status(500).json({ success: false, message: "Internal server error", error: error.message });
    }
});




// Get all customers
router.get("/GetCustomersList", async (req, res) => {
    try {
        const [customers, orders, transactions] = await Promise.all([
            Customers.find({}).lean(),
            Order.find({}, 'Customer_uuid').lean(),
            Transaction.find({}, 'Journal_entry').lean()
        ]);

        const usedFromOrders = new Set(orders.map((l) => l.Customer_uuid));
        
        const usedFromTransactions = new Set();
        for (const tx of transactions) {
            for (const entry of tx.Journal_entry) {
                usedFromTransactions.add(entry.Account_id);
            }
        }
        const allUsed = new Set([...usedFromOrders, ...usedFromTransactions]);

        const customerWithUsage = customers.map((cust) => ({
            ...cust._doc,
            isUsed: allUsed.has(cust.Customer_uuid),
        }));
        res.json({
            success: true,
            result: customerWithUsage,
        });
    } catch (error) {
        console.error("Error fetching customers:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

// Check for duplicate customer name
router.get("/checkDuplicateName", async (req, res) => {
    try {
        const { name } = req.query;

        if (!name) {
            return res.status(400).json({ success: false, message: "Customer name is required" });
        }

        const existingCustomer = await Customers.findOne({ Customer_name: name.trim() });

        if (existingCustomer) {
            return res.status(200).json({ success: true, exists: true });
        } else {
            return res.status(200).json({ success: true, exists: false });
        }
    } catch (error) {
        console.error("Error in /checkDuplicateName:", error);
        return res.status(500).json({ success: false, message: "Internal server error" });
    }
});

router.get('/GetLinkedCustomerIds', async (req, res) => {
    try {
        const orders = await Order.find({}, 'Customer_uuid').lean();
        const transactions = await Transaction.find({}, 'Customer_uuid').lean();

        const linkedSet = new Set();

        orders.forEach(o => o.Customer_uuid && linkedSet.add(o.Customer_uuid.toString()));
        transactions.forEach(t => t.Customer_uuid && linkedSet.add(t.Customer_uuid.toString()));

        const linkedCustomerIds = Array.from(linkedSet);

        res.json({ success: true, linkedCustomerIds });
    } catch (err) {
        console.error('Error fetching linked customer UUIDs:', err);
        res.status(500).json({ success: false, message: 'Server Error' });
    }
});

// Get a specific customer
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

// Update a customer
router.put("/update/:id", async (req, res) => {
    const { id } = req.params;
    const { Customer_name, Mobile_number, Customer_group, Status, Tags, LastInteraction } = req.body;

    try {
        const user = await Customers.findByIdAndUpdate(id, {
            Customer_name,
            Mobile_number,
            Customer_group,
            Status,
            Tags,
            LastInteraction
        }, { new: true });

        if (!user) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        res.json({ success: true, result: user });
    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// Delete a customer
router.delete('/DeleteCustomer/:id', async (req, res) => {
    try {
        const customerId = req.params.id;

        // Check if customer exists
        const customer = await Customers.findById(customerId);
        if (!customer) {
            return res.status(404).json({ success: false, message: 'Customer not found.' });
        }

        // Check if linked with orders
        const isLinkedToOrder = await Order.exists({ customerId });
        if (isLinkedToOrder) {
            return res.json({ success: false, message: 'Cannot delete: Customer linked with orders.' });
        }

        // Check if linked with transactions
        const isLinkedToTransaction = await Transaction.exists({ customerId });
        if (isLinkedToTransaction) {
            return res.json({ success: false, message: 'Cannot delete: Customer linked with transactions.' });
        }

        // Delete customer if not linked
        await Customers.findByIdAndDelete(customerId);
        res.json({ success: true, message: 'Customer deleted successfully.' });
    } catch (error) {
        console.error('Delete customer error:', error);
        res.status(500).json({ success: false, message: 'Server error while deleting customer.' });
    }
});

// Get customer report (with Status, Tags, LastInteraction)
router.get("/GetCustomerReport", async (req, res) => {
    try {
        const data = await Customers.find({}).lean();
        if (data.length) {
            const report = data.map(customer => ({
                Customer_name: customer.Customer_name,
                Mobile_number: customer.Mobile_number,
                Customer_group: customer.Customer_group,
                Status: customer.Status,
                Tags: customer.Tags.join(", "),
                LastInteraction: customer.LastInteraction ? customer.LastInteraction : "No interaction",
            }));

            res.json({ success: true, result: report });
        } else {
            res.status(404).json({ success: false, message: "No customers found" });
        }
    } catch (error) {
        console.error("Error generating customer report:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

module.exports = router;
