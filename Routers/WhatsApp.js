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
    logoutSession,
  } = require('../Services/whatsappService');

  // Initialize a session
  router.post('/whatsapp/session/:id/init', async (req, res) => {
    try {
      await setupWhatsApp(io, req.params.id);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // List sessions
  router.get('/whatsapp/sessions', (req, res) => {
    res.json({ success: true, sessions: listSessions() });
  });

  // Delete a session
  router.delete('/whatsapp/session/:id', async (req, res) => {
    const ok = await logoutSession(req.params.id);
    res.json({ success: ok });
  });

  // Get QR code data
  router.get('/whatsapp/session/:id/qr', async (req, res) => {
    const qr = getLatestQR(req.params.id);
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

  // QR Image page
  router.get('/whatsapp/session/:id/qr-image', async (req, res) => {
    const qr = getLatestQR(req.params.id);
    if (!qr) return res.send('❌ QR code not yet generated. Try again shortly.');
    const imageUrl = await qrcode.toDataURL(qr);
    res.send(`<h2>Scan WhatsApp QR Code</h2><img src="${imageUrl}" alt="QR Code" />`);
  });

  // Message history for a session
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

  // Send a message via a specific session
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

  // Status of a session
  router.get('/whatsapp/session/:id/status', (req, res) => {
    const sessionId = req.params.id;
    res.json({ status: isWhatsAppReady(sessionId) ? 'connected' : 'disconnected' });
  });

  // Simple management page
  router.get('/whatsapp/manage', (req, res) => {
    const sessions = listSessions();
    let html = '<h2>WhatsApp Sessions</h2><ul>';
    sessions.forEach(s => {
      html += `<li>${s.sessionId} - ${s.ready ? 'Connected' : 'Pending'} - <a href="/whatsapp/session/${s.sessionId}/qr-image" target="_blank">QR</a></li>`;
    });
    html += '</ul>';
    res.send(html);
  });

  // Legacy routes (default session)
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

  router.get('/qr-image', async (req, res) => {
    const qr = getLatestQR();
    if (!qr) return res.send('❌ QR code not yet generated. Try again shortly.');
    const imageUrl = await qrcode.toDataURL(qr);
    res.send(`<h2>Scan WhatsApp QR Code</h2><img src="${imageUrl}" alt="QR Code" />`);
  });

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

  router.get('/whatsapp-status', (req, res) => {
    res.json({ status: isWhatsAppReady() ? 'connected' : 'disconnected' });
  });

  return router;
};
