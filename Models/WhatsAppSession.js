const mongoose = require('mongoose');

const WhatsAppSessionSchema = new mongoose.Schema({
  _id: String, // Typically 'session'
  data: Object
});

module.exports = mongoose.model('WhatsAppSession', WhatsAppSessionSchema);
