const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const {
  exchangeMetaToken,
  listAccounts,
  deleteAccount,
  sendText,
  sendTemplate,
  sendMedia,
  getTemplates,
  verifyWebhook,
  receiveWebhook,
} = require('../controllers/whatsappController');

const router = express.Router();

const messagingLimiter = createRateLimiter({ windowMs: 60 * 1000, maxRequests: 30 });

// Webhook (no auth)
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// 🔥 FIXED ROUTE (matches frontend)
router.post('/embedded-signup/exchange-code', requireAuth, exchangeMetaToken);

// Account management
router.get('/accounts', requireAuth, listAccounts);
router.delete('/accounts/:id', requireAuth, deleteAccount);

// Messaging
router.post('/send-text', requireAuth, messagingLimiter, sendText);
router.post('/send-template', requireAuth, messagingLimiter, sendTemplate);
router.post('/send-media', requireAuth, messagingLimiter, sendMedia);

// Templates
router.get('/templates', requireAuth, getTemplates);

module.exports = router;
