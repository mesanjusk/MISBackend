const mongoose = require('mongoose');

const ScheduledMessageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  to: { type: String, required: true },
  message: { type: String, required: true },
  sendAt: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'sent', 'failed'], default: 'scheduled' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('ScheduledMessage', ScheduledMessageSchema);
