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

// ================== COMMON HELPERS ==================
const parseWebhookTimestamp = (timestampInSeconds) => {
  const parsedTimestamp = Number(timestampInSeconds);
  return Number.isNaN(parsedTimestamp) ? new Date() : new Date(parsedTimestamp * 1000);
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

// ================== SEND TEXT ==================
const sendText = asyncHandler(async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) throw new AppError('to and body are required', 400);

  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) throw new AppError('Invalid recipient number', 400);

  try {
    const response = await axios.post(
      graphUrl,
      { messaging_product: 'whatsapp', to: normalizedTo, type: 'text', text: { body } },
      { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
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

    return res.status(200).json({ success: true, data: response.data });
  } catch (err) {
    console.error("❌ TEXT ERROR:", err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ================== SEND TEMPLATE ==================
// ================== SEND TEMPLATE ==================
const sendTemplate = asyncHandler(async (req, res) => {
  const {
    to,
    template_name,
    language = "en_US",
    components = []
  } = req.body;

  if (!to || !template_name) {
    throw new AppError('to and template_name are required', 400);
  }

  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) {
    throw new AppError('Invalid recipient number', 400);
  }

  // ✅ Ensure body component exists
  let finalComponents = components;

  if (!components.length) {
    throw new AppError('Template parameters missing', 400);
  }

  // ✅ Clean empty parameters (VERY IMPORTANT)
  finalComponents = components.map((comp) => {
    if (comp.type === "body") {
      return {
        ...comp,
        parameters: comp.parameters.filter(p => p.text && p.text.trim() !== "")
      };
    }
    return comp;
  });

  // ✅ Debug log
  const finalPayload = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'template',
    template: {
      name: template_name,
      language: { code: language },
      components: finalComponents
    }
  };

  console.log("📤 FINAL TEMPLATE PAYLOAD:", JSON.stringify(finalPayload, null, 2));

  try {
    const response = await axios.post(
      graphUrl,
      finalPayload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log("✅ TEMPLATE SENT SUCCESS:", response.data);

    // ✅ Save message
    await saveAndEmitMessage({
      fromMe: true,
      from: WHATSAPP_PHONE_NUMBER_ID || '',
      to: normalizedTo,
      message: template_name,
      body: template_name,
      timestamp: new Date(),
      status: 'sent',
      direction: 'outgoing',
    });

    return res.status(200).json({
      success: true,
      data: response.data
    });

  } catch (err) {
    console.error("❌ META REAL ERROR:", JSON.stringify(err.response?.data, null, 2));

    return res.status(500).json({
      success: false,
      error: err.response?.data || err.message
    });
  }
});

// ================== GET TEMPLATES ==================
const getTemplates = asyncHandler(async (_req, res) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/${WHATSAPP_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/message_templates`,
      { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } }
    );

    return res.status(200).json({ success: true, templates: response.data.data || [] });
  } catch (err) {
    console.error("❌ GET TEMPLATES ERROR:", err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

// ================== GET MESSAGES ==================
const getMessages = asyncHandler(async (req, res) => {
  const sortOrder = String(req.query.sort || '').toLowerCase();
  const includeUiFields = String(req.query.includeUiFields || '').toLowerCase() === 'true';
  const includeUnreadCount = String(req.query.includeUnreadCount || '').toLowerCase() === 'true';

  // Keep legacy/default behavior exactly the same unless optional query param is explicitly used.
  const isLatestFirst = sortOrder === 'latest' || sortOrder === 'desc';
  const sort = isLatestFirst ? { timestamp: -1, time: -1, createdAt: -1 } : { timestamp: 1, time: 1, createdAt: 1 };

  const rawMessages = await Message.find({}).sort(sort).lean();

  const messages = includeUiFields
    ? rawMessages.map((message) => {
        const baseTime = message.timestamp || message.time || message.createdAt;
        const messageDate = baseTime ? new Date(baseTime) : null;
        const isValidDate = messageDate && !Number.isNaN(messageDate.getTime());

        return {
          ...message,
          formattedTime: isValidDate
            ? messageDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
            : '',
          groupedDate: isValidDate ? messageDate.toISOString().split('T')[0] : '',
        };
      })
    : rawMessages;

  if (includeUnreadCount) {
    const unreadCount = rawMessages.reduce((count, message) => {
      const incoming = message.direction === 'incoming' || message.fromMe === false;
      const markedAsRead = message.status === 'read';
      return incoming && !markedAsRead ? count + 1 : count;
    }, 0);

    return res.json({ data: messages, unreadCount });
  }
  return res.json({ data: messages });
});

// ================== WEBHOOK ==================
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
};

const receiveWebhook = (req, res) => {
  try {
    const enforceSignature = process.env.WHATSAPP_ENFORCE_WEBHOOK_SIGNATURE !== 'false';
    const hasAppSecret = Boolean(WHATSAPP_APP_SECRET);

    if (enforceSignature && hasAppSecret) {
      const signature = req.headers['x-hub-signature-256'];
      const rawBody = req.rawBody || '';
      const expectedSignature = 'sha256=' + crypto.createHmac('sha256', WHATSAPP_APP_SECRET).update(rawBody).digest('hex');

      if (signature !== expectedSignature) {
        console.warn('[whatsapp] Invalid webhook signature');
        return res.status(200).json({ received: true });
      }
    }

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    const messageEvents = value?.messages;
    if (!Array.isArray(messageEvents)) return res.status(200).json({ received: true });

    const destinationNumber = value?.metadata?.phone_number_id || value?.metadata?.display_phone_number || WHATSAPP_PHONE_NUMBER_ID || '';
    const incomingPayloads = messageEvents.map((msg) => ({
      fromMe: false,
      from: msg?.from || '',
      to: destinationNumber,
      message: extractMessageBody(msg),
      body: extractMessageBody(msg),
      timestamp: parseWebhookTimestamp(msg?.timestamp),
      status: 'received',
      direction: 'incoming',
      text: extractMessageBody(msg),
      time: parseWebhookTimestamp(msg?.timestamp),
    }));

    res.status(200).json({ received: true });
    setImmediate(async () => { for (const payload of incomingPayloads) await saveAndEmitMessage(payload); });
  } catch (error) {
    console.error('[whatsapp] Webhook error:', error);
    return res.status(200).json({ received: true });
  }
};

module.exports = {
  exchangeMetaToken: asyncHandler(async (_req, _res) => { /* stub */ }),
  manualConnect: asyncHandler(async (_req, _res) => { /* stub */ }),
  listAccounts: asyncHandler(async (_req, _res) => { /* stub */ }),
  deleteAccount: asyncHandler(async (_req, _res) => { /* stub */ }),
  sendText,
  sendTemplate,
  sendMedia: asyncHandler(async (_req, _res) => { /* stub */ }),
  getTemplates,
  getMessages,
  verifyWebhook,
  receiveWebhook,
};