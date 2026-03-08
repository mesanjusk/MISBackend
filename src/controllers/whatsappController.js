const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const axios = require('axios');
const crypto = require('crypto');
const WhatsAppMessage = require('../models/WhatsAppMessage');

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION = 'v20.0',
} = process.env;

const normalizePhone = (to) => String(to || '').replace(/\D/g, '');

const graphUrl = `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

const getMessageType = (type) => {
  const allowedTypes = ['text', 'image', 'video', 'audio', 'document'];
  return allowedTypes.includes(type) ? type : 'unknown';
};

const getAllowedStatus = (status) => {
  const allowedStatuses = ['sent', 'delivered', 'read', 'failed'];
  return allowedStatuses.includes(status) ? status : 'failed';
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

  const sentMessages = Array.isArray(response.data?.messages) ? response.data.messages : [];
  const now = new Date();

  if (sentMessages.length > 0) {
    await Promise.all(
      sentMessages.map((message) =>
        WhatsAppMessage.create({
          from: String(WHATSAPP_PHONE_NUMBER_ID || ''),
          to: normalizedTo,
          messageId: message.id,
          type: 'text',
          text: body,
          status: 'sent',
          timestamp: now,
          direction: 'outgoing',
        })
      )
    );
  }

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
    if (!process.env.WHATSAPP_APP_SECRET) {
      throw new AppError('WHATSAPP_APP_SECRET is required for webhook signature validation', 500);
    }

    if (!req.rawBody) {
      throw new AppError('Raw webhook body is required for signature validation', 400);
    }

    const expectedSignature =
      'sha256=' +
      crypto
        .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
        .update(req.rawBody)
        .digest('hex');

    if (!signature) {
      throw new AppError('Missing webhook signature', 401);
    }

    const provided = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
      throw new AppError('Invalid webhook signature', 401);
    }
  }

  const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];

    for (const change of changes) {
      const value = change?.value || {};
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      const metadataPhone = String(value?.metadata?.display_phone_number || '');

      for (const message of messages) {
        const messageType = getMessageType(message?.type);
        const textBody =
          messageType === 'text'
            ? message?.text?.body || ''
            : message?.[messageType]?.caption || '';

        await WhatsAppMessage.create({
          from: String(message?.from || ''),
          to: metadataPhone,
          messageId: String(message?.id || ''),
          type: messageType,
          text: textBody,
          status: 'received',
          timestamp: message?.timestamp ? new Date(Number(message.timestamp) * 1000) : new Date(),
          direction: 'incoming',
        });
      }

      for (const statusItem of statuses) {
        const messageId = String(statusItem?.id || '');

        if (!messageId) {
          continue;
        }

        await WhatsAppMessage.findOneAndUpdate(
          { messageId },
          {
            $set: {
              from: metadataPhone,
              to: String(statusItem?.recipient_id || ''),
              status: getAllowedStatus(statusItem?.status),
              timestamp: statusItem?.timestamp
                ? new Date(Number(statusItem.timestamp) * 1000)
                : new Date(),
              direction: 'outgoing',
            },
            $setOnInsert: {
              type: 'unknown',
              text: '',
            },
          },
          { upsert: true, new: true }
        );
      }
    }
  }

  return res.status(200).json({ received: true });
});

const getMessages = asyncHandler(async (_req, res) => {
  const messages = await WhatsAppMessage.find({})
    .sort({ createdAt: -1 })
    .limit(200)
    .lean();

  return res.status(200).json({
    success: true,
    data: messages,
  });
});

module.exports = {
  sendText,
  verifyWebhook,
  receiveWebhook,
  getMessages,
};
