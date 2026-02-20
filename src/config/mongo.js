const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoURI =
      process.env.MONGO_URI ||
      process.env.MONGODB_URI ||
      process.env.MONGO_URL;

    if (!mongoURI) {
      throw new Error(
        "MongoDB connection string is not set. Provide MONGO_URI, MONGODB_URI, or MONGO_URL."
      );
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
