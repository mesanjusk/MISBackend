const express = require('express');
const router = express.Router();
const qrcode = require('qrcode');
const Message = require('../Models/Message');

const {
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
} = require('../Services/whatsappService');

// QR Route
router.get('/qr', async (req, res) => {
  const qr = getLatestQR();
  if (!qr) {
    return res.status(200).json({
      status: 'pending',
      message: 'QR code not yet generated. Please wait...'
    });
  }

  try {
    const qrImage = await qrcode.toDataURL(qr);
    res.status(200).json({
      status: 'ready',
      qrImage,
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Failed to generate QR code',
      error: err.message,
    });
  }
});

// QR Image Route
router.get('/qr-image', async (req, res) => {
  const qr = getLatestQR();
  if (!qr) return res.send('❌ QR code not yet generated. Try again shortly.');
  const imageUrl = await qrcode.toDataURL(qr);
  res.send(`<h2>Scan WhatsApp QR Code</h2><img src="${imageUrl}" alt="QR Code" />`);
});

// Message History
router.get('/messages/:number', async (req, res) => {
  const number = req.params.number;
  const messages = await Message.find({
    $or: [
      { from: number, to: 'me' },
      { from: 'me', to: number },
    ],
  }).sort({ time: 1 });

  res.json({ success: true, messages });
});

// Send WhatsApp Message
router.post('/send-message', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) {
    return res.status(400).json({ error: 'Missing number or message' });
  }

  try {
    if (!isWhatsAppReady()) {
      return res.status(400).json({ success: false, error: 'WhatsApp not ready. Scan QR in backend first.' });
    }
    const response = await sendMessageToWhatsApp(number, message);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// WhatsApp Status
router.get('/whatsapp-status', (req, res) => {
  res.json({ status: isWhatsAppReady() ? 'connected' : 'disconnected' });
});

module.exports = router;
