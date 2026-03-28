const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const {
  exchangeMetaToken,
  manualConnect,
  listAccounts,
  deleteAccount,
  sendText,
  sendTemplate,
  sendMedia,
  sendMessage,
  getTemplates,
  verifyWebhook,
  receiveWebhook,
  getMessages,
  getAnalytics,
} = require('../controllers/whatsappController');

// Rate limiter for sending messages
const messagingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

// ---------- Embedded Signup ----------
router.post('/embedded-signup/exchange-code', exchangeMetaToken);

// ---------- Manual connect (for SaaS clients) ----------
router.post('/manual-connect', manualConnect);

// ---------- Account routes ----------
router.get('/accounts', listAccounts);
router.delete('/accounts/:id', deleteAccount);

// ---------- Messaging routes ----------
router.post('/send-text', requireAuth, messagingLimiter, sendText);
router.post('/send-template', requireAuth, messagingLimiter, sendTemplate);
router.post('/send-media', requireAuth, messagingLimiter, sendMedia);
router.post('/send-message', requireAuth, messagingLimiter, sendMessage);

// ---------- Templates ----------
router.get('/templates', requireAuth, getTemplates);

// ---------- Messages API ----------
router.get('/messages', requireAuth, getMessages);
router.get('/analytics', requireAuth, getAnalytics);

// ---------- Webhook (no auth) ----------
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// ---------- Test route ----------
router.get('/test', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'WhatsApp API Active',
  });
});

module.exports = router;
