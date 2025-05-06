const mongoose = require('mongoose');

// Define the schema for the WhatsApp session
const sessionSchema = new mongoose.Schema(
  {
    session: { type: Object, required: true }, // To store session data
    createdAt: { type: Date, default: Date.now }, // Timestamp of when the session was created
  },
  { timestamps: true }
);

// Create a model for the session
const SessionModel = mongoose.model('WhatsAppSession', sessionSchema);

module.exports = SessionModel;
