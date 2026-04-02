const express = require('express');
const router = express.Router();
const { enforceWhatsApp24hWindow } = require('../middleware/whatsapp24hGuard');

const {
  exchangeMetaToken,
  manualConnect, // ⭐ FIX: ADD THIS
  listAccounts,
  deleteAccount,
  sendText,
  sendTemplate,
  sendMedia,
  createAutoReplyRule,
  getTemplates,
  verifyWebhook,
  receiveWebhook,
} = require('../controllers/whatsappController.js');

// Embedded Signup (Meta)
router.post('/embedded-signup/exchange-code', exchangeMetaToken);

// ⭐ TEMPORARYy MANUAL CONNECT (for SaaS clients without TP approval)
router.post('/manual-connect', manualConnect);

// Account routes
router.get('/accounts', listAccounts);
router.delete('/accounts/:id', deleteAccount);

// Messaging routes
router.post('/send-text', enforceWhatsApp24hWindow, sendText);
router.post('/send-template', enforceWhatsApp24hWindow, sendTemplate);
router.post('/send-media', enforceWhatsApp24hWindow, sendMedia);
router.post('/auto-reply', createAutoReplyRule);

// Templates
router.get('/templates', getTemplates);

// Webhook
router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

module.exports = router;
