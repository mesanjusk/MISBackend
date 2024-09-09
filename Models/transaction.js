const mongoose = require('mongoose');

const journalSchema = new mongoose.Schema({
    Account_id: { type: Number, required: true },
    Object_id: { type: Number, required: true },
    Account_name: { type: String, required: true },
    Debit: { type: Number, required: true },
    Credit: { type: Number, required: true } 
  });

const TransactionSchema=new mongoose.Schema({
    Transaction_uuid: { type: String },
    Transaction_date: { type: String, required: true },
    Description: { type: String, required: true },
    Total_Debit: { type: Number, required: true },
    Total_Credit: { type: Number, required: true },
    Created_by: { type: String, required: true },
    Created_at: { type: Date, required: true },
    Journal_entry: [journalSchema],
 },  { timestamps: true })

 const Transaction = mongoose.model("Transaction", TransactionSchema);

module.exports = Transaction;