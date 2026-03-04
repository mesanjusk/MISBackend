const mongoose = require('mongoose');

const whatsappMessageSchema = new mongoose.Schema(
  {
    from: { type: String, trim: true },
    to: { type: String, trim: true },
    messageId: { type: String, trim: true, index: true },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'unknown'],
      default: 'unknown',
    },
    text: { type: String, default: '' },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read', 'failed', 'received'],
      default: 'received',
    },
    timestamp: { type: Date, default: Date.now },
    direction: {
      type: String,
      enum: ['incoming', 'outgoing'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('WhatsAppMessage', whatsappMessageSchema);
