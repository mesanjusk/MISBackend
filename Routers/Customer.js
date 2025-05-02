// routes/customer.js
const express = require("express");
const router = express.Router();
const Customer = require("../models/Customer"); // adjust path if needed

// Check for duplicate customer name
router.post("/checkName", async (req, res) => {
    const { Customer_name } = req.body;
    try {
        if (!Customer_name || Customer_name.trim() === "") {
            return res.status(400).json({ exists: false, error: "Customer name is required" });
        }

        const existingCustomer = await Customer.findOne({ Customer_name: Customer_name.trim() });

        res.json({ exists: !!existingCustomer });
    } catch (err) {
        console.error("Error checking customer name:", err);
        res.status(500).json({ exists: false, error: "Internal server error" });
    }
});

module.exports = router;
