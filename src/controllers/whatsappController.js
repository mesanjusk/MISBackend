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

/* ============================================================
   COMMON HELPERS
============================================================ */
const parseWebhookTimestamp = (timestampInSeconds) => {
  const parsedTimestamp = Number(timestampInSeconds);
  if (Number.isNaN(parsedTimestamp)) return new Date();
  return new Date(parsedTimestamp * 1000);
};

const extractMessageBody = (message) => {
  if (!message) return '';
  if (message.text?.body) return message.text.body;
  if (message.button?.text) return message.button.text;
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  return '';
};

const saveAndEmitMessage = async (payload) => {
  const savedMessage = await Message.create(payload);
  console.log(`[whatsapp] Saved ${savedMessage.direction || 'unknown'} message ${savedMessage._id}`);
  emitNewMessage(savedMessage.toObject());
  return savedMessage;
};

/* ============================================================
   SEND TEXT (ONLY WORKS IN 24H WINDOW)
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

  try {
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

    return res.status(200).json({
      success: true,
      data: response.data,
    });

  } catch (err) {
    console.error("❌ TEXT ERROR:", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

/* ============================================================
   ✅ SEND TEMPLATE (NEW - USE THIS)
============================================================ */
const sendTemplate = asyncHandler(async (req, res) => {
  const { to, template_name, language = "en", components = [] } = req.body;

  if (!to || !template_name) {
    throw new AppError('to and template_name are required', 400);
  }

  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) {
    throw new AppError('Invalid recipient number', 400);
  }

  try {
    const response = await axios.post(
      graphUrl,
      {
        messaging_product: 'whatsapp',
        to: normalizedTo,
        type: 'template',
        template: {
          name: template_name,
          language: { code: language },
          components: components,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
      }
    );

    await saveAndEmitMessage({
      fromMe: true,
      from: WHATSAPP_PHONE_NUMBER_ID || '',
      to: normalizedTo,
      message: `[TEMPLATE] ${template_name}`,
      body: `[TEMPLATE] ${template_name}`,
      timestamp: new Date(),
      status: 'sent',
      direction: 'outgoing',
    });

    return res.status(200).json({
      success: true,
      data: response.data,
    });

  } catch (err) {
    console.error("❌ TEMPLATE ERROR:", err.response?.data || err.message);

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
});

/* ============================================================
   GET MESSAGES
============================================================ */
const getMessages = asyncHandler(async (_req, res) => {
  const messages = await Message.find({})
    .sort({ timestamp: 1, time: 1, createdAt: 1 })
    .lean();

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

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (mode === 'subscribe' && token === verifyToken) {
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
    }

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const messageEvents = value?.messages;

    if (!Array.isArray(messageEvents)) {
      return res.status(200).json({ received: true });
    }

    const destinationNumber =
      value?.metadata?.phone_number_id ||
      value?.metadata?.display_phone_number ||
      WHATSAPP_PHONE_NUMBER_ID ||
      '';

    const incomingPayloads = messageEvents.map((msg) => {
      const parsedTimestamp = parseWebhookTimestamp(msg?.timestamp);
      const extractedBody = extractMessageBody(msg);

      return {
        fromMe: false,
        from: msg?.from || '',
        to: destinationNumber,
        message: extractedBody,
        body: extractedBody,
        timestamp: parsedTimestamp,
        status: 'received',
        direction: 'incoming',
        text: extractedBody,
        time: parsedTimestamp,
      };
    });

    res.status(200).json({ received: true });

    setImmediate(async () => {
      for (const payload of incomingPayloads) {
        await saveAndEmitMessage(payload);
      }
    });

  } catch (error) {
    console.error('[whatsapp] Webhook error:', error);
    return res.status(200).json({ received: true });
  }
};

module.exports = {
  sendText,
  sendTemplate, // ✅ NEW
  getMessages,
  verifyWebhook,
  receiveWebhook,
};