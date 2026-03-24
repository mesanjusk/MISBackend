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

const extractIncomingMessagePayloads = (body) => {
  const entries = Array.isArray(body?.entry) ? body.entry : [];

  return entries.flatMap((entry) => {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    return changes
      .map((change) => change?.value)
      .filter((value) => value && Array.isArray(value.messages) && value.messages.length > 0);
  });
};

const parseWebhookTimestamp = (timestampInSeconds) => {
  const parsedTimestamp = Number(timestampInSeconds);

  if (Number.isNaN(parsedTimestamp)) {
    return new Date();
  }

  return new Date(parsedTimestamp * 1000);
};

const extractMessageBody = (message) => {
  if (!message) {
    return '';
  }

  if (message.text?.body) {
    return message.text.body;
  }

  if (message.button?.text) {
    return message.button.text;
  }

  if (message.interactive?.button_reply?.title) {
    return message.interactive.button_reply.title;
  }

  if (message.interactive?.list_reply?.title) {
    return message.interactive.list_reply.title;
  }

  return '';
};

const saveAndEmitMessage = async (payload) => {
  const savedMessage = await Message.create(payload);
  console.log(`[whatsapp] Saved ${savedMessage.direction || 'unknown'} message ${savedMessage._id}`);
  emitNewMessage(savedMessage.toObject());
  return savedMessage;
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

  console.log(`[whatsapp] Sending outgoing text message to ${normalizedTo}`);
  console.log("Graph URL:", graphUrl);

  let response;

  try {
    response = await axios.post(
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
  } catch (err) {
    console.error("❌ META API ERROR FULL:", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }

  await saveAndEmitMessage({
    fromMe: true,
    from: WHATSAPP_PHONE_NUMBER_ID || '',
    to: normalizedTo,
    message: body,
    body,
    timestamp: new Date(),
    status: 'sent',
    direction: 'outgoing',
  });

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

  const messages = await Message.find({})
    .sort({ timestamp: 1, time: 1, createdAt: 1 })
    .lean();

  console.log(`[whatsapp] Returning ${messages.length} message(s)`);

  return res.json({ data: messages });
});

/* ============================================================
   WEBHOOK VERIFY
============================================================ */
const verifyWebhook = (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error('[whatsapp] Webhook verification error:', error);
    return res.sendStatus(403);
  }
};

/* ============================================================
   WEBHOOK RECEIVE
============================================================ */
const receiveWebhook = (req, res) => {
  try {
    const enforceSignature = process.env.WHATSAPP_ENFORCE_WEBHOOK_SIGNATURE !== 'false';
    const hasAppSecret = Boolean(WHATSAPP_APP_SECRET);

    if (enforceSignature && hasAppSecret) {
      const signature = req.headers['x-hub-signature-256'];
      const rawBody = req.rawBody || '';

      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', WHATSAPP_APP_SECRET)
          .update(rawBody)
          .digest('hex');

      if (signature !== expectedSignature) {
        console.warn('[whatsapp] Invalid webhook signature');
        return res.status(200).json({ received: true });
      }
    } else if (enforceSignature && !hasAppSecret) {
      console.warn('[whatsapp] Signature enforcement skipped: WHATSAPP_APP_SECRET is not configured');
    }

    const messageEvents = req.body?.entry?.[0]?.changes?.[0]?.value?.messages;

    if (!Array.isArray(messageEvents) || messageEvents.length === 0) {
      console.log('No message event received');
      return res.status(200).json({ received: true });
    }

    messageEvents.forEach((incomingMessage) => {
      const structuredLog = {
        from: incomingMessage?.from || null,
        message: incomingMessage?.text?.body || '',
        timestamp: incomingMessage?.timestamp || null,
      };

      console.log('[whatsapp] Incoming message:', structuredLog);
    });

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[whatsapp] Webhook receive error:', error);
    return res.status(200).json({ received: true });
  }
};

module.exports = {
  sendText,
  getMessages,
  verifyWebhook,
  receiveWebhook,
};
