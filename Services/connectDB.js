// Services/connectDB.js

const mongoose = require('mongoose');
require('dotenv').config(); // Load environment variables

const connectDB = async () => {
  try {
    // Using the environment variable for the MongoDB connection URI
    const mongoURI = process.env.MONGO_URI;

    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useFindAndModify: false, // prevents deprecation warning
      retryWrites: true, // Enables retry logic for certain errors
    });

    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
