const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    fromMe: Boolean,
    from: String,
    to: String,
    message: String,
    body: String,
    timestamp: Date,
    status: String,
    direction: String,
    messageId: String,
    type: String,
    text: String,
    mediaUrl: String,
    mediaId: String,
    caption: String,
    filename: String,
    mimeType: String,
    time: Date,
    customerUuid: String,
    customerId: String,
    isRead: {
      type: Boolean,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

messageSchema.pre('save', function syncLegacyFields(next) {
  if (typeof this.fromMe === 'undefined') {
    this.fromMe = this.direction === 'outgoing';
  }

  if (!this.message && this.body) {
    this.message = this.body;
  }

  if (!this.message && this.text) {
    this.message = this.text;
  }

  if (!this.message && this.mediaUrl) {
    this.message = this.mediaUrl;
  }

  if (!this.body && this.message) {
    this.body = this.message;
  }

  if (!this.body && this.text) {
    this.body = this.text;
  }

  if (!this.text && this.body) {
    this.text = this.body;
  }

  if (!this.text && this.message && this.type === 'text') {
    this.text = this.message;
  }

  if (!this.timestamp && this.time) {
    this.timestamp = this.time;
  }

  if (!this.time && this.timestamp) {
    this.time = this.timestamp;
  }

  if (this.fromMe === true || this.direction === 'outgoing') {
    this.isRead = true;
    if (!this.readAt) {
      this.readAt = this.timestamp || this.time || new Date();
    }
  } else if (this.fromMe === false || this.direction === 'incoming') {
    if (typeof this.isRead === 'undefined' || this.isRead === null) {
      this.isRead = false;
    }
  }

  next();
});

messageSchema.index({ from: 1 });
messageSchema.index({ to: 1 });
messageSchema.index({ timestamp: 1 });
messageSchema.index({ time: -1 });
messageSchema.index({ messageId: 1 }, { sparse: true });
messageSchema.index({ customerUuid: 1 });
messageSchema.index({ from: 1, to: 1, isRead: 1, timestamp: -1 });

module.exports = mongoose.model('Message', messageSchema);
