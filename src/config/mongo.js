const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;

    if (!mongoURI) {
      throw new Error("MONGO_URI is not set");
    }

    await mongoose.connect(mongoURI, { autoIndex: true });

    // Ensure all indexes defined in schemas are created in MongoDB
    await mongoose.connection.syncIndexes();

    console.log("✅ MongoDB connected and indexes synced");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
