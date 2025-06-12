module.exports = (io) => {
  const express = require('express');
  const router = express.Router();
  const qrcode = require('qrcode');
  const Message = require('../Models/Message');
  const {
    getLatestQR,
    isWhatsAppReady,
    sendMessageToWhatsApp,
    setupWhatsApp,
    listSessions,
    logoutSession
  } = require('../Services/whatsappService');

  // 🔄 Start a session
  router.post('/start-session', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'Missing sessionId' });

    try {
      await setupWhatsApp(io, sessionId);
      res.json({ success: true, message: `Started session ${sessionId}` });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 🔁 Reset session
  router.post('/reset-session', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ success: false, message: 'Missing sessionId' });

    const success = await logoutSession(sessionId);
    if (success) {
      res.json({ success: true, message: `Session ${sessionId} reset. Restart or call /start-session to re-init.` });
    } else {
      res.status(404).json({ success: false, message: `Session ${sessionId} not found.` });
    }
  });

  // 📋 Get all session statuses
  router.get('/sessions', (req, res) => {
    res.json({ success: true, sessions: listSessions() });
  });

  // 🔍 Get QR code for a session
  router.get('/whatsapp/session/:id/qr', async (req, res) => {
    const qr = getLatestQR(req.params.id);
    if (!qr) {
      return res.status(200).json({
        status: 'pending',
        message: 'QR code not yet generated. Please wait...',
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

  // 🖼️ QR as image for browser view
  router.get('/whatsapp/session/:id/qr-image', async (req, res) => {
    const qr = getLatestQR(req.params.id);
    if (!qr) return res.send('❌ QR code not yet generated. Try again shortly.');
    const imageUrl = await qrcode.toDataURL(qr);
    res.send(`<h2>Scan WhatsApp QR Code (${req.params.id})</h2><img src="${imageUrl}" alt="QR Code" />`);
  });

  // ✉️ Message history
  router.get('/whatsapp/session/:id/messages/:number', async (req, res) => {
    const sessionId = req.params.id;
    const number = req.params.number;
    const messages = await Message.find({
      $or: [
        { from: number, to: sessionId },
        { from: sessionId, to: number },
      ],
    }).sort({ time: 1 });

    res.json({ success: true, messages });
  });

  // 🚀 Send message via session
  router.post('/whatsapp/session/:id/send-message', async (req, res) => {
    const sessionId = req.params.id;
    const { number, message } = req.body;
    if (!number || !message) {
      return res.status(400).json({ error: 'Missing number or message' });
    }

    try {
      if (!isWhatsAppReady(sessionId)) {
        return res.status(400).json({ success: false, error: 'WhatsApp not ready. Scan QR first.' });
      }
      const response = await sendMessageToWhatsApp(number, message, sessionId);
      return res.status(200).json(response);
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // 📡 Session status check
  router.get('/whatsapp/session/:id/status', (req, res) => {
    const sessionId = req.params.id;
    res.json({ status: isWhatsAppReady(sessionId) ? 'connected' : 'disconnected' });
  });

  // 🌐 Simple QR viewer for quick scan
  router.get('/whatsapp/manage', (req, res) => {
    const sessions = listSessions();
    let html = '<h2>WhatsApp Sessions</h2><ul>';
    sessions.forEach(s => {
      html += `<li>${s.sessionId} - ${s.ready ? '✅ Connected' : '🕓 Pending'} - <a href="/whatsapp/session/${s.sessionId}/qr-image" target="_blank">QR</a></li>`;
    });
    html += '</ul>';
    res.send(html);
  });

  // 📦 Legacy fallback for "default" session (optional)
  router.get('/qr', async (req, res) => {
    const qr = getLatestQR();
    if (!qr) {
      return res.status(200).json({
        status: 'pending',
        message: 'QR code not yet generated. Please wait...',
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

  router.get('/qr-image', async (req, res) => {
    const qr = getLatestQR();
    if (!qr) return res.send('❌ QR code not yet generated. Try again shortly.');
    const imageUrl = await qrcode.toDataURL(qr);
    res.send(`<h2>Scan WhatsApp QR Code</h2><img src="${imageUrl}" alt="QR Code" />`);
  });

  // 💬 Legacy message history (default session)
  router.get('/messages/:number', async (req, res) => {
    const number = req.params.number;
    const messages = await Message.find({
      $or: [
        { from: number, to: 'default' },
        { from: 'default', to: number },
      ],
    }).sort({ time: 1 });

    res.json({ success: true, messages });
  });

  // ✉️ Legacy send-message (default session)
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

  // ⚙️ Status for frontend polling
  router.get('/whatsapp-status', (req, res) => {
    res.json({ status: isWhatsAppReady() ? 'connected' : 'disconnected' });
  });

  return router;
};
