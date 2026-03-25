const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

const router = express.Router();

// Controllers
const {
  exchangeMetaToken,
  manualConnect,
  listAccounts,
  deleteAccount,
  sendText,
  sendTemplate,
  sendMedia,
  getTemplates,
  getMessages,
  verifyWebhook,
  receiveWebhook,
} = require('../controllers/whatsappController.js');

// ---------------------- Embedded Signup (Meta) ----------------------
router.post('/embedded-signup/exchange-code', exchangeMetaToken);

// ---------------------- Temporary Manual Connect ----------------------
router.post('/manual-connect', manualConnect);

// ---------------------- Accounts ----------------------
router.get('/accounts', listAccounts);
router.delete('/accounts/:id', deleteAccount);

// ---------------------- Messaging ----------------------
const messagingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

router.post('/send-text', requireAuth, messagingLimiter, sendText);
router.post('/send-template', sendTemplate); // No auth required if needed
router.post('/send-media', sendMedia);

// ---------------------- Templates ----------------------
router.get('/templates', getTemplates);

// ---------------------- Messages ----------------------
router.get('/messages', getMessages);

// ---------------------- Webhook ----------------------
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// ---------------------- Test Route ----------------------
router.get('/test', (_req, res) => {
  res.status(200).json({
    success: true,
    message: 'WhatsApp Cloud Router Active',
  });
});

module.exports = router;