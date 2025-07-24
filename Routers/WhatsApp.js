const express = require('express');
const qrcode = require('qrcode');
const {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
  logoutSession,
} = require('../Services/whatsappService');

const router = express.Router();
const sessionId = 'default';

// Automatically initialize on import (no socket.io needed here)
setupWhatsApp({ emit: () => {} }, sessionId);

// Serve QR as image in browser
router.get('/scan', async (req, res) => {
  const qr = getLatestQR(sessionId);
  if (!qr) return res.send(`<h2>QR not ready. Please wait and refresh.</h2>`);

  const image = await qrcode.toDataURL(qr);
  res.send(`
    <h2>Scan this QR to login WhatsApp</h2>
    <img src="${image}" />
  `);
});

// Send message to WhatsApp
router.post('/send', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ success: false, message: 'Missing number or message' });

  try {
    if (!isWhatsAppReady(sessionId)) {
      return res.status(400).json({ success: false, message: 'WhatsApp not ready. Scan QR first.' });
    }

    const result = await sendMessageToWhatsApp(number, message, sessionId);
    return res.json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Logout session
router.post('/logout', async (req, res) => {
  const ok = await logoutSession(sessionId);
  return res.json({ success: ok });
});

module.exports = router;
