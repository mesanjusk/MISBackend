const express = require("express");
const router = express.Router();
const Transaction = require("../Models/transaction");
const { v4: uuid } = require("uuid");

router.post("/addTransaction", async (req, res) => {
    const {
      Description,
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
        Transaction_date: new Date().toISOString().split("T")[0],
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

module.exports = router;
