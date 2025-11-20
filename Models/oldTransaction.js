import mongoose from "mongoose";

const JournalEntrySchema = new mongoose.Schema({
  Account_id: { type: String },
  Type: { type: String },
  Amount: { type: Number },
}, { _id: true });

const OldTransactionSchema = new mongoose.Schema({
  Transaction_uuid: { type: String },
  Transaction_id: { type: Number },
  Transaction_date: { type: Date },
  Description: { type: String },
  Total_Debit: { type: Number },
  Total_Credit: { type: Number },
  Payment_mode: { type: String },
  Created_by: { type: String },
  image: { type: String },
  Journal_entry: [JournalEntrySchema],

}, { timestamps: true });

// The 3rd parameter MUST match the collection name in MongoDB
export default mongoose.model("OldTransaction", OldTransactionSchema, "oldtransactions");
