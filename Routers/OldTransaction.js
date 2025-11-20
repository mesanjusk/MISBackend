const express = require("express");
const router = express.Router();
const OldTransaction = require("../Models/oldTransaction"); 
const { v4: uuid } = require("uuid");
const Customer = require("../Models/customer");
const multer = require("multer");
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../utils/cloudinary.js');

// Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "oldtransactions",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    transformation: [
      { width: 1920, height: 1080, crop: "limit", quality: "auto:best" }
    ],
  },
});

const upload = multer({ storage });


// ======================= ADD TRANSACTION =======================
router.post("/addTransaction", upload.single("image"), async (req, res) => {
  try {
    const {
      Description,
      Transaction_date,
      Total_Debit,
      Total_Credit,
      Payment_mode,
      Created_by,
    } = req.body;

    let { Journal_entry } = req.body;

    // Parse JSON if string
    try {
      if (typeof Journal_entry === "string") {
        Journal_entry = JSON.parse(Journal_entry);
      }
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format for Journal_entry",
      });
    }

    // Validate journal entries
    if (!Array.isArray(Journal_entry) || Journal_entry.length === 0) {
      return res.status(400).json({ success: false, message: "Journal_entry is required" });
    }

    for (let entry of Journal_entry) {
      if (!entry.Account_id || !entry.Type || !entry.Amount) {
        return res.status(400).json({
          success: false,
          message: "Each journal entry must have Account_id, Type, and Amount",
        });
      }
    }

    // Image
    const file = req.file;
    const imageUrl = file ? file.path : null;

    // Generate incremental transaction number
    const lastTransaction = await OldTransaction.findOne().sort({ Transaction_id: -1 });
    const newTransactionNumber = lastTransaction ? lastTransaction.Transaction_id + 1 : 1;

    const newTransaction = new OldTransaction({
      Transaction_uuid: uuid(),
      Transaction_id: newTransactionNumber,
      Transaction_date: new Date(Transaction_date), // FIXED
      Total_Debit,
      Total_Credit,
      Journal_entry,
      Payment_mode,
      Description,
      image: imageUrl,
      Created_by,
    });

    await newTransaction.save();

    return res.json({ success: true, message: "Transaction added successfully" });

  } catch (error) {
    console.error("Error saving Transaction:", error);
    return res.status(500).json({ success: false, message: "Failed to add Transaction" });
  }
});


router.get("/GetTransactionList", async (req, res) => {
    try {
        const data = await OldTransaction.find({});
        if (data.length) {
            res.json({ success: true, result: data.filter(a => a.Description) });
        } else {
            res.json({ success: false, message: "Transaction Not found" });
        }
    } catch (err) {
        console.error("Error fetching Transaction:", err);
        res.status(500).json({ success: false, message: err });
    }
});

router.get('/GetFilteredTransactions', async (req, res) => {
    try {
        const startDateStr = req.query.startDate;
        const endDateStr = req.query.endDate;
        const customerNameFilter = req.query.customerName ? req.query.customerName.toLowerCase() : null;


        const startDate = startDateStr ? new Date(startDateStr) : new Date('1970-01-01');
        const endDate = endDateStr ? new Date(endDateStr) : new Date(); 

        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            return res.status(400).json({ success: false, message: 'Invalid date format' });
        }

        endDate.setHours(23, 59, 59, 999);

        const query = {
            Transaction_date: {
                $gte: startDate,
                $lte: endDate
            }
        };

        const [customers, transactions] = await Promise.all([
            Customer.find({}),
            OldTransaction.find(query)
        ]);

        const customerMap = customers.reduce((map, customer) => {
            map[customer.Customer_uuid] = customer.Customer_name;
            return map;
        }, {});

        console.log('Customer Map:', customerMap);

        const filteredTransactions = transactions.filter(transaction => {
            const journalEntries = transaction.Journal_entry || [];
            const customerNames = journalEntries
                .map(entry => customerMap[entry.Account_id])
                .filter(name => name)
                .map(name => name.toLowerCase());

            const matchesCustomer = customerNameFilter 
                ? customerNames.some(name => name.includes(customerNameFilter))
                : true;

            return matchesCustomer;
        });


        res.status(200).json({ success: true, result: filteredTransactions });

    } catch (err) {
        console.error("Error filtering transactions:", err);
        res.status(500).json({ success: false, message: 'Database query failed' });
    }
});

module.exports = router;
