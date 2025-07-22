const express = require("express");
const router = express.Router();
const Transaction = require("../Models/transaction");
const Customer = require("../Models/customer");
const { v4: uuid } = require("uuid");
const multer = require("multer");
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('../utils/cloudinary.js');

// Cloudinary Storage for multer
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'transactions',
    allowed_formats: ['jpg', 'png', 'jpeg', 'webp'],
    transformation: [{ width: 1920, height: 1080, crop: 'limit', quality: 'auto:best' }],
  },
});

const upload = multer({ storage });

router.post("/addTransaction", upload.single("image"), async (req, res) => {
  try {
    const {
      Description,
      Transaction_date,
      Order_uuid,
      Total_Debit,
      Total_Credit,
      Payment_mode,
      Created_by,
    } = req.body;

    let { Journal_entry } = req.body;

    try {
      if (typeof Journal_entry === "string") {
        Journal_entry = JSON.parse(Journal_entry);
      }
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format for Journal_entry",
      });
    }

    if (
      !Array.isArray(Journal_entry) ||
      !Journal_entry.length ||
      !Journal_entry[0].Account_id ||
      !Journal_entry[0].Type ||
      !Journal_entry[0].Amount
    ) {
      return res.status(400).json({
        success: false,
        message: "Fields in Journal_entry are required.",
      });
    }

    const file = req.file;
    const imageUrl = file ? file.path : null;

    // Generate new Transaction ID
    const lastTransaction = await Transaction.findOne().sort({ Transaction_id: -1 });
    const newTransactionNumber = lastTransaction ? lastTransaction.Transaction_id + 1 : 1;

    const newTransaction = new Transaction({
      Transaction_uuid: uuid(),
      Transaction_id: newTransactionNumber,
      Order_uuid,
      Transaction_date,
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
        const data = await Transaction.find({});
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
            Transaction.find(query)
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
router.post('/CheckMultipleCustomers', async (req, res) => {
    try {
        const { ids } = req.body;
        const linkedTransactions = await Transaction.find({ Customer_id: { $in: ids } }).distinct('Customer_id');
        res.status(200).json({ linkedIds: linkedTransactions });
    } catch (err) {
        res.status(500).json({ error: 'Error checking linked transactions' });
    }
});


router.get('/CheckCustomer/:customerUuid', async (req, res) => {
  const { customerUuid } = req.params;

  try {
      const transactionExists = await Transaction.findOne({
          'Journal_entry.Account_id': customerUuid
      });

      return res.json({ exists: !!transactionExists }); 
  } catch (error) {
      console.error('Error checking transactions:', error);
      return res.status(500).json({ success: false, message: 'Internal server error' });
  }
});
router.put('/updateByTransactionId/:transactionId', async (req, res) => {
  const { transactionId } = req.params;
  const {
    updatedDescription,
    updatedAmount,
    updatedDate,
    creditAccountId,
    debitAccountId
  } = req.body;

  try {
    const txn = await Transaction.findOne({ Transaction_id: parseInt(transactionId) });

    if (!txn) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    txn.Description = updatedDescription;
    txn.Transaction_date = updatedDate;

    txn.Journal_entry = txn.Journal_entry.map((entry) => {
      if (entry.Type.toLowerCase() === 'credit') {
        return { ...entry, Account_id: creditAccountId, Amount: updatedAmount };
      } else if (entry.Type.toLowerCase() === 'debit') {
        return { ...entry, Account_id: debitAccountId, Amount: updatedAmount };
      }
      return entry;
    });

    txn.Total_Credit = updatedAmount;
    txn.Total_Debit = updatedAmount;

    await txn.save();

    res.json({ success: true, message: 'Transaction updated successfully' });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});


// Delete a specific Journal Entry inside a Transaction by Transaction_id and Account_id
router.delete('/deleteEntry/:transactionId/:accountId', async (req, res) => {
    const { transactionId, accountId } = req.params;

    try {
        const transaction = await Transaction.findOne({ Transaction_id: parseInt(transactionId) });

        if (!transaction) {
            return res.status(404).json({ success: false, message: 'Transaction not found' });
        }

        const originalLength = transaction.Journal_entry.length;

        // Remove the specific journal entry
        transaction.Journal_entry = transaction.Journal_entry.filter(
            entry => entry.Account_id !== accountId
        );

        if (transaction.Journal_entry.length === originalLength) {
            return res.status(404).json({ success: false, message: 'Entry not found in transaction' });
        }

        // Optionally update totals if needed
        transaction.Total_Debit = transaction.Journal_entry
            .filter(e => e.Type === "debit")
            .reduce((acc, cur) => acc + (Number(cur.Amount) || 0), 0);

        transaction.Total_Credit = transaction.Journal_entry
            .filter(e => e.Type === "credit")
            .reduce((acc, cur) => acc + (Number(cur.Amount) || 0), 0);

        await transaction.save();

        return res.json({ success: true, message: 'Entry deleted successfully' });

    } catch (error) {
        console.error('Error deleting journal entry:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

router.get('/distinctPaymentModes', async (req, res) => {
  try {
    const modes = await Transaction.distinct("Payment_mode");
    res.json({ success: true, result: modes });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to fetch modes" });
  }
});


module.exports = router;
