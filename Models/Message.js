const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  from: String,       // 'me' or sender's WhatsApp number
  to: String,         // receiver's number (normalized)
  text: String,       // message content
  time: { type: Date, default: Date.now }
});

// Indexes to speed up chat history searches
MessageSchema.index({ from: 1 });
MessageSchema.index({ to: 1 });
MessageSchema.index({ time: -1 });

module.exports = mongoose.model('Message', MessageSchema);
