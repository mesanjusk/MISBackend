const mongoose = require('mongoose');

// Ensure indexes are built automatically even in production
mongoose.set('autoIndex', true);

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb+srv://sanjuahuja:cY7NtMKm8M10MbUs@cluster0.wdfsd.mongodb.net/MISSK');
    console.log('✅ MongoDB connected');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
