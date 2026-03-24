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
    text: String,
    time: Date,
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

  if (!this.body && this.message) {
    this.body = this.message;
  }

  if (!this.body && this.text) {
    this.body = this.text;
  }

  if (!this.text && this.body) {
    this.text = this.body;
  }

  if (!this.text && this.message) {
    this.text = this.message;
  }

  if (!this.timestamp && this.time) {
    this.timestamp = this.time;
  }

  if (!this.time && this.timestamp) {
    this.time = this.timestamp;
  }

  next();
});

messageSchema.index({ from: 1 });
messageSchema.index({ to: 1 });
messageSchema.index({ timestamp: 1 });
messageSchema.index({ time: -1 });

module.exports = mongoose.model('Message', messageSchema);
