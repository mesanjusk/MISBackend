const mongoose = require('mongoose');

const flowSessionSchema = new mongoose.Schema(
  {
    user: { type: String, required: true, index: true },
    flowId: { type: mongoose.Schema.Types.ObjectId, ref: 'Flow', required: true, index: true },
    currentNodeId: { type: String, required: true },
    variables: { type: mongoose.Schema.Types.Mixed, default: {} },
    awaiting: {
      nodeId: { type: String, default: null },
      inputType: { type: String, enum: ['question', 'button', null], default: null },
    },
    isCompleted: { type: Boolean, default: false, index: true },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'flowSessions' }
);

flowSessionSchema.index({ user: 1, isCompleted: 1, updatedAt: -1 });

module.exports = mongoose.model('FlowSession', flowSessionSchema);
