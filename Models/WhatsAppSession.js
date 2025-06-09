const mongoose = require('mongoose');

const WhatsAppSessionSchema = new mongoose.Schema({
  session: String,
  data: Object
});

module.exports = mongoose.model('WhatsAppSession', WhatsAppSessionSchema);
