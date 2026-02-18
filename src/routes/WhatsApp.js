const express = require('express');
const router = express.Router();

const {
  exchangeMetaToken,
  manualConnect, // ⭐ FIX: ADD THIS
  listAccounts,
  deleteAccount,
  sendText,
  sendTemplate,
  sendMedia,
  getTemplates,
  verifyWebhook,
  receiveWebhook,
} = require('../controllers/whatsappController.js');

// Embedded Signup (Meta)
router.post('/embedded-signup/exchange-code', exchangeMetaToken);

// ⭐ TEMPORARY MANUAL CONNECT (for SaaS clients without TP approval)
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

// Webhook
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

module.exports = router;
