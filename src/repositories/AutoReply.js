const mongoose = require('mongoose');

const autoReplySchema = new mongoose.Schema(
  {
    keyword: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    matchType: {
      type: String,
      enum: ['exact', 'contains'],
      default: 'contains',
    },
    replyType: {
      type: String,
      enum: ['text', 'template'],
      default: 'text',
    },
    reply: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    delaySeconds: {
      type: Number,
      min: 0,
      max: 30,
      default: null,
    },
  },
  { timestamps: true, collection: 'autoReplies' }
);

autoReplySchema.index({ isActive: 1, keyword: 1, matchType: 1 });

module.exports = mongoose.model('AutoReply', autoReplySchema);
