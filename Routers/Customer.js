const express = require("express");
const router = express.Router();
const Customers = require("../Models/customer");
const { v4: uuid } = require("uuid");

router.post("/addCustomer", async (req, res) => {
    const { Customer_name, Mobile_number, Customer_group } = req.body;

    try {
        const check = await Customers.findOne({ Mobile_number });

        if (check) {
            return res.status(400).json({ success: false, message: "Mobile number already exists" });
        }

        const newCustomer = new Customers({
            Customer_name,
            Mobile_number,
            Customer_group,
            Customer_uuid: uuid()
        });

        await newCustomer.save();
        res.status(201).json({ success: true, message: "Customer added successfully" });

    } catch (error) {
        console.error("Error saving customer:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

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

const mongoose = require("mongoose");

router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;

        let customer;
        if (mongoose.Types.ObjectId.isValid(id)) {
            customer = await Customers.findOne({ _id: id });
        } else {
            customer = await Customers.findOne({ Customer_uuid: id });
        }

        if (!customer) {
            return res.status(404).json({ message: "Customer not found" });
        }
        res.json(customer);
    } catch (error) {
        console.error("Error fetching customer:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});


router.put("/update/:id", async (req, res) => {
    const { Customer_name, Mobile_number, Customer_group } = req.body;

    try {
        const existingCustomer = await Customers.findOne({ Mobile_number, _id: { $ne: req.params.id } });
        if (existingCustomer) {
            return res.status(400).json({ success: false, message: "Mobile number already in use" });
        }

        const updatedCustomer = await Customers.findByIdAndUpdate(
            req.params.id,
            { Customer_name, Mobile_number, Customer_group },
            { new: true, runValidators: true }
        );

        if (!updatedCustomer) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        res.status(200).json({ success: true, message: "Customer updated successfully", result: updatedCustomer });

    } catch (error) {
        console.error("Error updating customer:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

router.delete("/DeleteCustomer/:customerUuid", async (req, res) => {
    try {
        const result = await Customers.findOneAndDelete({ Customer_uuid: req.params.customerUuid });

        if (!result) {
            return res.status(404).json({ success: false, message: "Customer not found" });
        }

        res.status(200).json({ success: true, message: "Customer deleted successfully" });

    } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({ success: false, message: "Internal server error" });
    }
});

module.exports = router;
