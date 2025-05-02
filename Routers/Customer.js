const express = require("express");
const router = express.Router();
const Customers = require("../Models/customer");
const { v4: uuid } = require("uuid");

router.post("/addCustomer", async (req, res) => {
    const { Customer_name, Mobile_number, Customer_group } = req.body;

    try {
        const check = await Customers.findOne({ Customer_name });

        if (check) {
            return res.status(400).json({ success: false, message: "Customer name already exists" });
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


router.put("/update/:id", async (req, res) => {
    const { id } = req.params;
    const { Customer_name, Mobile_number, Customer_group } = req.body;

    try {
        const user = await Customers.findByIdAndUpdate(id, {
            Customer_name, 
            Mobile_number, 
            Customer_group
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
