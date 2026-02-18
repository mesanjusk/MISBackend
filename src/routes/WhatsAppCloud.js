const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const {
  exchangeMetaToken,
  manualConnect, // ⭐ IMPORTANT
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

const messagingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

// ================== DEBUG ROUTE (KEEP THIS) ==================
router.get('/test', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'WhatsApp Cloud Router Active',
  });
});
// =============================================================

// Webhook (NO auth)
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// Embedded signup
router.post(
  '/embedded-signup/exchange-code',
  requireAuth,
  exchangeMetaToken
);

// ⭐ MANUAL CONNECT (TEMP SaaS MODE)
router.post(
  '/manual-connect',
  requireAuth,
  manualConnect
);

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
