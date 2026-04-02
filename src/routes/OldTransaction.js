const express = require("express");
const router = express.Router();
const OldTransaction = require("../repositories/oldTransaction");
const { v4: uuid } = require("uuid");
const Customer = require("../repositories/customer");
const multer = require("multer");
const cloudinary = require("../utils/cloudinary.js");

/**
 * Multer: in-memory storage
 * We will upload the buffer manually to Cloudinary.
 */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * Upload a file buffer to Cloudinary and return the secure URL.
 */
async function uploadToCloudinary(file) {
  if (!file) return null;

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "oldtransactions",
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

// ======================= ADD TRANSACTION ==================

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
      return res.status(400).json({
        success: false,
        message: "Journal_entry is required",
      });
    }

    for (let entry of Journal_entry) {
      if (!entry.Account_id || !entry.Type || !entry.Amount) {
        return res.status(400).json({
          success: false,
          message:
            "Each journal entry must have Account_id, Type, and Amount",
        });
      }
    }

    // Image: upload to Cloudinary (instead of using file.path)
    const file = req.file;
    const imageUrl = file ? await uploadToCloudinary(file) : null;

    // Generate incremental transaction number
    const lastTransaction = await OldTransaction.findOne().sort({
      Transaction_id: -1,
    });
    const newTransactionNumber = lastTransaction
      ? lastTransaction.Transaction_id + 1
      : 1;

    const newTransaction = new OldTransaction({
      Transaction_uuid: uuid(),
      Transaction_id: newTransactionNumber,
      Transaction_date: new Date(Transaction_date), // already present in original
      Total_Debit,
      Total_Credit,
      Journal_entry,
      Payment_mode,
      Description,
      image: imageUrl,
      Created_by,
    });

    await newTransaction.save();

    return res.json({
      success: true,
      message: "Transaction added successfully",
    });
  } catch (error) {
    console.error("Error saving Transaction:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add Transaction",
    });
  }
});

// ======================= GET ALL OLD TRANSACTIONS ==================

router.get("/GetTransactionList", async (req, res) => {
  try {
    const data = await OldTransaction.find({});
    if (data.length) {
      // Keep same behaviour: filter out entries without Description
      res.json({
        success: true,
        result: data.filter((a) => a.Description),
      });
    } else {
      res.json({
        success: false,
        message: "Transaction Not found",
      });
    }
  } catch (err) {
    console.error("Error fetching Transaction:", err);
    res.status(500).json({
      success: false,
      message: err,
    });
  }
});

// ======================= FILTERED OLD TRANSACTIONS ==================

router.get("/GetFilteredTransactions", async (req, res) => {
  try {
    const {
      startDate: startDateStr,
      endDate: endDateStr,
      customerName,
    } = req.query;

    let query = {};

    // Only apply date filter if dates are sent
    if (startDateStr || endDateStr) {
      const startDate = startDateStr
        ? new Date(startDateStr)
        : new Date("1970-01-01");
      const endDate = endDateStr ? new Date(endDateStr) : new Date();
      endDate.setHours(23, 59, 59, 999);

      query.Transaction_date = { $gte: startDate, $lte: endDate };
    }

    // Fetch all customers + filtered transactions in parallel
    const [customers, transactions] = await Promise.all([
      Customer.find({}),
      OldTransaction.find(query),
    ]);

    const customerMap = customers.reduce((map, customer) => {
      map[customer.Customer_uuid] = customer.Customer_name;
      return map;
    }, {});

    const filterName = customerName ? customerName.toLowerCase() : null;

    const filteredTransactions = transactions.filter((transaction) => {
      const namesFromJournal = (transaction.Journal_entry || [])
        .map((e) => customerMap[e.Account_id])
        .filter(Boolean)
        .map((n) => n.toLowerCase());

      return filterName
        ? namesFromJournal.some((n) => n.includes(filterName))
        : true;
    });

    res.json({ success: true, result: filteredTransactions });
  } catch (err) {
    console.error("Error filtering transactions:", err);
    res.status(500).json({
      success: false,
      message: "Database query failed",
    });
  }
});

module.exports = router;
