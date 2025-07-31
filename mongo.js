const mongoose = require('mongoose');

const connectDB = async () => {
  try {
     await mongoose.connect('mongodb+srv://sanjuahuja:cY7NtMKm8M10MbUs@cluster0.wdfsd.mongodb.net/MISSK', {
      autoIndex: true,
    });

    // Ensure all indexes defined in schemas are created in MongoDB
    await mongoose.connection.syncIndexes();

    console.log('✅ MongoDB connected and indexes synced');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
