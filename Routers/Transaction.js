const express = require("express");
const router = express.Router();
const Transaction = require("../Models/transaction");
const Customer = require("../Models/customer");
const { v4: uuid } = require("uuid");

router.post("/addTransaction", async (req, res) => {
    const {
      Description,
      Transaction_date,
      Order_uuid,
      Total_Debit,
      Total_Credit,
      Payment_mode,
      Created_by,
      Journal_entry = [{}],
    } = req.body;
    if (!Journal_entry || !Journal_entry.length || !Journal_entry[0].Account_id || !Journal_entry[0].Type || !Journal_entry[0].Amount) {
      return res.status(400).json({
        success: false,
        message: "fields in Journal_entry are required.",
      });
    }
  
    try {
      const lastTransaction = await Transaction.findOne().sort({ Transaction_id: -1 });
      const newTransactionNumber = lastTransaction ? lastTransaction.Transaction_id + 1 : 1;
  
      const newTransaction = new Transaction({
        Transaction_uuid: uuid(),
        Transaction_id: newTransactionNumber,
        Order_uuid,
        Transaction_date,
        Total_Debit,
        Total_Credit,
        Journal_entry: Journal_entry,
        Payment_mode,
        Description,
        Created_by
      });
  
      await newTransaction.save();
      res.json({ success: true, message: "Transaction added successfully" });
    } catch (error) {
      console.error("Error saving Transaction:", error);
      res.status(500).json({ success: false, message: "Failed to add Transaction" });
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

        const customers = await Customer.find({});
        const customerMap = customers.reduce((map, customer) => {
            map[customer.Customer_uuid] = customer.Customer_name;
            return map;
        }, {});

        console.log('Customer Map:', customerMap);

        const query = {
            Transaction_date: {
                $gte: startDate,
                $lte: endDate
            }
        };

        const transactions = await Transaction.find(query);

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

module.exports = router;
