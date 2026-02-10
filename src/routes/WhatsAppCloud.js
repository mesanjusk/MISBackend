const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const {
  getMetaConfig,
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

router.get('/webhook', verifyWebhook);
router.post('/webhook', receiveWebhook);

router.get('/meta/config', requireAuth, getMetaConfig);
router.post('/meta/exchange-token', requireAuth, exchangeMetaToken);
router.get('/accounts', requireAuth, listAccounts);
router.delete('/accounts/:id', requireAuth, deleteAccount);

router.post('/send-text', requireAuth, messagingLimiter, sendText);
router.post('/send-template', requireAuth, messagingLimiter, sendTemplate);
router.post('/send-media', requireAuth, messagingLimiter, sendMedia);

router.get('/templates', requireAuth, getTemplates);

module.exports = router;
