const mongoose = require('mongoose');

const WhatsAppSessionSchema = new mongoose.Schema({
  session: String,
  data: Object
});

// Index to quickly find sessions
WhatsAppSessionSchema.index({ session: 1 });

module.exports = mongoose.model('WhatsAppSession', WhatsAppSessionSchema);
