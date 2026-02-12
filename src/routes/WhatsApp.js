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
} = require('../controllers/whatsappController');

// 🔥 REQUIRED FOR EMBEDDED SIGNUP
router.post('/embedded-signup/exchange-code', exchangeMetaToken);

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
