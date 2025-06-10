const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  from: String,       // 'me' or sender's WhatsApp number
  to: String,         // receiver's number (normalized)
  text: String,       // message content
  time: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Message', MessageSchema);
