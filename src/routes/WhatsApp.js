const express = require('express');
const router = express.Router();

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
  manualConnect, // ⭐ ADD THIS
} = require('../controllers/whatsappController');

// 🔥 REQUIRED FOR EMBEDDED SIGNUP (Meta TP flow)
router.post('/embedded-signup/exchange-code', exchangeMetaToken);

// ⭐ NEW: Manual Connect (Temporary for SaaS clients without TP approval)
router.post('/manual-connect', manualConnect);

// Account routes
router.get('/accounts', listAccounts);
router.delete('/accounts/:id', deleteAccount);

// Messaging routes
router.post('/send-text', sendText);
router.post('/send-template', sendTemplate);
router.post('/send-media', sendMedia);

// Templates
router.get('/templates', getTemplates);

// Webhook (Meta)
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);


module.exports = router;
