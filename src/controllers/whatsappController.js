const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const axios = require('axios');
const crypto = require('crypto');
const Message = require('../repositories/Message');
const { emitNewMessage } = require('../socket');

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION,
  WHATSAPP_APP_SECRET,
} = process.env;

const normalizePhone = (to) => String(to || '').replace(/\D/g, '');

const graphUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

const extractIncomingMessagePayload = (body) => {
  return body?.entry?.[0]?.changes?.[0]?.value || null;
};

const parseWebhookTimestamp = (timestampInSeconds) => {
  const parsedTimestamp = Number(timestampInSeconds);

  if (Number.isNaN(parsedTimestamp)) {
    return new Date();
  }

  return new Date(parsedTimestamp * 1000);
};

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
   GET MESSAGES
============================================================ */
const getMessages = asyncHandler(async (_req, res) => {
  console.log('[whatsapp] Fetching messages from MongoDB');

  const messages = await Message.find({}).sort({ timestamp: 1, time: 1, createdAt: 1 });

  console.log(`[whatsapp] Returning ${messages.length} message(s)`);

  return res.json({ data: messages });
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
    const rawBody = req.rawBody || '';

    const expectedSignature =
      'sha256=' +
      crypto
        .createHmac('sha256', WHATSAPP_APP_SECRET)
        .update(rawBody)
        .digest('hex');

    if (signature !== expectedSignature) {
      throw new AppError('Invalid webhook signature', 401);
    }
  }

  console.log('Webhook event:', JSON.stringify(req.body));

  const value = extractIncomingMessagePayload(req.body);
  const incomingMessage = value?.messages?.[0];

  if (!incomingMessage) {
    console.log('[whatsapp] Webhook received without messages[0]; skipping DB save');
    return res.status(200).json({ received: true });
  }

  const savedMessage = await Message.create({
    from: incomingMessage.from || '',
    to: value?.metadata?.display_phone_number || value?.metadata?.phone_number_id || '',
    body: incomingMessage?.text?.body || '',
    timestamp: parseWebhookTimestamp(incomingMessage.timestamp),
    status: 'received',
    direction: 'incoming',
  });

  console.log(`[whatsapp] Saved incoming message ${savedMessage._id}`);
  emitNewMessage(savedMessage);

  return res.status(200).json({ received: true });
});

module.exports = {
  sendText,
  getMessages,
  verifyWebhook,
  receiveWebhook,
};
