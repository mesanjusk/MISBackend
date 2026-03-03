const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const axios = require('axios');
const crypto = require('crypto');

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION,
  WHATSAPP_APP_SECRET,
} = process.env;

const normalizePhone = (to) => String(to || '').replace(/\D/g, '');

const graphUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

/* ============================================================
   SEND TEXT MESSAGE (Single Business Mode)
============================================================ */
const sendText = asyncHandler(async (req, res) => {
  const { to, body } = req.body;

  if (!to || !body) {
    throw new AppError('to and body are required', 400);
  }

  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) {
    throw new AppError('Invalid recipient number', 400);
  }

  const response = await axios.post(
    graphUrl,
    {
      messaging_product: 'whatsapp',
      to: normalizedTo,
      type: 'text',
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  res.status(200).json({
    success: true,
    data: response.data,
  });
});

/* ============================================================
   WEBHOOK VERIFY
============================================================ */
const verifyWebhook = asyncHandler(async (req, res) => {
  const verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === verifyToken) {
    return res.status(200).send(challenge);
  }

  throw new AppError('Webhook verification failed', 403);
});

/* ============================================================
   WEBHOOK RECEIVE
============================================================ */
const receiveWebhook = asyncHandler(async (req, res) => {
  const enforceSignature = process.env.WHATSAPP_ENFORCE_WEBHOOK_SIGNATURE !== 'false';

  if (enforceSignature) {
    const signature = req.headers['x-hub-signature-256'];

    const expectedSignature =
      'sha256=' +
      crypto
        .createHmac('sha256', WHATSAPP_APP_SECRET)
        .update(req.rawBody)
        .digest('hex');

    if (signature !== expectedSignature) {
      throw new AppError('Invalid webhook signature', 401);
    }
  }

  console.log('Webhook event:', JSON.stringify(req.body));

  return res.status(200).json({ received: true });
});

module.exports = {
  sendText,
  verifyWebhook,
  receiveWebhook,
};