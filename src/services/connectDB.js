// Services/connectDB.js

const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables

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

    // No options needed for new Mongoose versions
    await mongoose.connect(mongoURI);

    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
