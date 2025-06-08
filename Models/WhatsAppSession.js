const mongoose = require('mongoose');

const whatsappSessionSchema = new mongoose.Schema({
  session: { type: Object },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('WhatsAppSession', whatsappSessionSchema);
