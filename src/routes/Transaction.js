const express = require("express");
const router = express.Router();
const Transaction = require("../repositories/transaction");
const Customer = require("../repositories/customer");
const { v4: uuid } = require("uuid");
const multer = require("multer");
const cloudinary = require("../utils/cloudinary.js");

// Multer using in-memory storage; we will stream files to Cloudinary manually
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Helper to upload a file buffer to Cloudinary and return the secure URL
async function uploadToCloudinary(file) {
  if (!file) return null;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "transactions",
        resource_type: "image",
        allowed_formats: ["jpg", "png", "jpeg", "webp"],
        transformation: [
          {
            width: 1920,
            height: 1080,
            crop: "limit",
            quality: "auto:best",
          },
        ],
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );

    stream.end(file.buffer);
  });
}

// =================== ROUTES ===================

// Add Transaction
router.post("/addTransaction", upload.single("image"), async (req, res) => {
  try {
    const {
      Description,
      Transaction_date,
      Order_uuid,
      Order_number,
      Total_Debit,
      Total_Credit,
      Payment_mode,
      Created_by,
      Journal_entry: journalEntryRaw,
      Customer_uuid,
    } = req.body;

    if (
      !Description ||
      !Transaction_date ||
      !Total_Debit ||
      !Total_Credit ||
      !Payment_mode ||
      !Created_by
    ) {
      return res.status(400).json({
        success: false,
        message: "Required fields are missing.",
      });
    }

    // Parse Journal_entry (can be JSON string from frontend)
    let Journal_entry = [];
    try {
      if (typeof journalEntryRaw === "string") {
        Journal_entry = JSON.parse(journalEntryRaw);
      } else if (Array.isArray(journalEntryRaw)) {
        Journal_entry = journalEntryRaw;
      } else {
        Journal_entry = [];
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

    // ⬇️ NEW: upload to Cloudinary (if file present)
    const file = req.file;
    const imageUrl = file ? await uploadToCloudinary(file) : null;

    // Generate new Transaction ID
    const lastTransaction = await Transaction.findOne().sort({
      Transaction_id: -1,
    });
    const newTransactionNumber = lastTransaction
      ? lastTransaction.Transaction_id + 1
      : 1;

    const newTransaction = new Transaction({
      Transaction_uuid: uuid(),
      Transaction_id: newTransactionNumber,
      Order_uuid,
      Order_number,
      Transaction_date,
      Total_Debit,
      Total_Credit,
      Journal_entry,
      Payment_mode,
      Description,
      image: imageUrl,
      Created_by,
      Customer_uuid: Customer_uuid || null,
    });

    await newTransaction.save();

    return res.status(201).json({
      success: true,
      message: "Transaction created successfully",
      result: newTransaction,
    });
  } catch (error) {
    console.error("Error in /addTransaction:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

// Get all transactions with optional filters
router.get("/", async (req, res) => {
  try {
    const { fromDate, toDate, paymentMode, createdBy, customerUuid } = req.query;

    const filter = {};

    if (fromDate || toDate) {
      filter.Transaction_date = {};
      if (fromDate) filter.Transaction_date.$gte = new Date(fromDate);
      if (toDate) filter.Transaction_date.$lte = new Date(toDate);
    }

    if (paymentMode) filter.Payment_mode = paymentMode;
    if (createdBy) filter.Created_by = createdBy;
    if (customerUuid) filter.Customer_uuid = customerUuid;

    const transactions = await Transaction.find(filter)
      .sort({ Transaction_date: -1 })
      .lean();

    return res.json({
      success: true,
      result: transactions,
    });
  } catch (error) {
    console.error("Error in GET /transactions:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    });
  }
});

// Get single transaction by uuid
router.get("/:uuid", async (req, res) => {
  try {
    const { uuid: transactionUuid } = req.params;

    const tx = await Transaction.findOne({
      Transaction_uuid: transactionUuid,
    }).lean();

    if (!tx) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.json({
      success: true,
      result: tx,
    });
  } catch (error) {
    console.error("Error in GET /transactions/:uuid:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transaction",
    });
  }
});

// Update transaction (without changing ID)
router.put("/:uuid", upload.single("image"), async (req, res) => {
  try {
    const { uuid: transactionUuid } = req.params;

    const {
      Description,
      Transaction_date,
      Order_uuid,
      Order_number,
      Total_Debit,
      Total_Credit,
      Payment_mode,
      Created_by,
      Journal_entry: journalEntryRaw,
      Customer_uuid,
    } = req.body;

    // Parse Journal_entry as in create route
    let Journal_entry = [];
    try {
      if (typeof journalEntryRaw === "string") {
        Journal_entry = JSON.parse(journalEntryRaw);
      } else if (Array.isArray(journalEntryRaw)) {
        Journal_entry = journalEntryRaw;
      } else {
        Journal_entry = [];
      }
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        message: "Invalid JSON format for Journal_entry",
      });
    }

    const file = req.file;
    const imageUrl = file ? await uploadToCloudinary(file) : undefined;

    const updateData = {
      Description,
      Transaction_date,
      Order_uuid,
      Order_number,
      Total_Debit,
      Total_Credit,
      Payment_mode,
      Created_by,
      Journal_entry,
      Customer_uuid: Customer_uuid || null,
    };

    // Only overwrite image if we actually uploaded a new one
    if (imageUrl !== undefined) {
      updateData.image = imageUrl;
    }

    const updated = await Transaction.findOneAndUpdate(
      { Transaction_uuid: transactionUuid },
      updateData,
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.json({
      success: true,
      message: "Transaction updated successfully",
      result: updated,
    });
  } catch (error) {
    console.error("Error in PUT /transactions/:uuid:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update transaction",
    });
  }
});

// Delete transaction
router.delete("/:uuid", async (req, res) => {
  try {
    const { uuid: transactionUuid } = req.params;

    const deleted = await Transaction.findOneAndDelete({
      Transaction_uuid: transactionUuid,
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    return res.json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    console.error("Error in DELETE /transactions/:uuid:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete transaction",
    });
  }
});

// Distinct payment modes
router.get("/distinctPaymentModes", async (req, res) => {
  try {
    const modes = await Transaction.distinct("Payment_mode");
    res.json({ success: true, result: modes });
  } catch (error) {
    console.error("Error in GET /transactions/distinctPaymentModes:", error);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch modes" });
  }
});

module.exports = router;
