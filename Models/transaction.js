const mongoose = require('mongoose');

const journalSchema = new mongoose.Schema({
    Account_id: { type: String,  required: true},
    Type: { type: String, required: true },
    Amount: { type: Number, required: true } 
  });

const TransactionSchema=new mongoose.Schema({
    Transaction_uuid: { type: String },
    Transaction_id: { type: Number },
    Order_uuid: { type: String },
    Transaction_date: { type: Date, required: true },
    Description: { type: String, required: true },
    Total_Debit: { type: Number, required: true },
    Total_Credit: { type: Number, required: true },
    Payment_mode: { type: String, required: true},
    Created_by: { type: String, required: true },
    Journal_entry: [journalSchema],
 },  { timestamps: true })

 const Transaction = mongoose.model("Transaction", TransactionSchema);

module.exports = Transaction;