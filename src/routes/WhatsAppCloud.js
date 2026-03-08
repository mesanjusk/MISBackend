const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const {
  sendText,
  verifyWebhook,
  receiveWebhook,
  getMessages,
} = require('../controllers/whatsappController');

const router = express.Router();

const messagingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);
router.post('/send-text', requireAuth, messagingLimiter, sendText);
router.get('/messages', requireAuth, getMessages);

module.exports = router;
