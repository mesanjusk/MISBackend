const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');

// 🔥 SAFE CONTROLLER IMPORT (Render/Linux safe)
const whatsappController = require('../controllers/whatsappController.js');

// Destructure AFTER import (prevents undefined crash)
const exchangeMetaToken = whatsappController.exchangeMetaToken;
const listAccounts = whatsappController.listAccounts;
const deleteAccount = whatsappController.deleteAccount;
const sendText = whatsappController.sendText;
const sendTemplate = whatsappController.sendTemplate;
const sendMedia = whatsappController.sendMedia;
const getTemplates = whatsappController.getTemplates;
const verifyWebhook = whatsappController.verifyWebhook;
const receiveWebhook = whatsappController.receiveWebhook;
const manualConnect = whatsappController.manualConnect;

const router = express.Router();

const messagingLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  maxRequests: 30,
});

// 🔍 Debug logs (IMPORTANT for Render debugging)
console.log('WhatsApp Controller Loaded:', {
  exchangeMetaToken: typeof exchangeMetaToken,
  manualConnect: typeof manualConnect,
  listAccounts: typeof listAccounts,
});

// ========================
// Webhook (NO AUTH)
// ========================
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

// ========================
// EMBEDDED SIGNUP (META)
// ========================
router.post(
  '/embedded-signup/exchange-code',
  requireAuth,
  exchangeMetaToken
);

// ========================
// ⭐ MANUAL CONNECT (FIXED)
// ========================
if (typeof manualConnect === 'function') {
  router.post('/manual-connect', requireAuth, manualConnect);
} else {
  console.error(
    '❌ ERROR: manualConnect is undefined. Check controllers/whatsappController export & filename case.'
  );
}

// ========================
// ACCOUNT MANAGEMENT
// ========================
router.get('/accounts', requireAuth, listAccounts);
router.delete('/accounts/:id', requireAuth, deleteAccount);

// ========================
// MESSAGING ROUTES
// ========================
router.post('/send-text', requireAuth, messagingLimiter, sendText);
router.post('/send-template', requireAuth, messagingLimiter, sendTemplate);
router.post('/send-media', requireAuth, messagingLimiter, sendMedia);

// ========================
// TEMPLATES
// ========================
router.get('/templates', requireAuth, getTemplates);

module.exports = router;
