const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const {
  sendText,
  getMessages,
  verifyWebhook,
  receiveWebhook,
} = require('../controllers/whatsappController');

const router = express.Router();

const messagingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

// Test route
router.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'WhatsApp Single Business Mode Active',
  });
});

// Messages API
router.get('/messages', getMessages);

// Webhook (no auth)
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// Send message
router.post('/send-text', requireAuth, messagingLimiter, sendText);

module.exports = router;
