const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    from: String,
    to: String,
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
  if (!this.body && this.text) {
    this.body = this.text;
  }

  if (!this.text && this.body) {
    this.text = this.body;
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
