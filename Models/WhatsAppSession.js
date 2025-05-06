// Models/WhatsAppSession.js
const mongoose = require('mongoose');

const WhatsAppSessionSchema = new mongoose.Schema({
  session: Object,
}, { timestamps: true });

module.exports = mongoose.model('WhatsAppSession', WhatsAppSessionSchema);
