const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const axios = require('axios');
const crypto = require('crypto');
const Message = require('../repositories/Message');
const CampaignMessageStatus = require('../repositories/CampaignMessageStatus');
const Contact = require('../repositories/contact');
const { emitNewMessage } = require('../socket');
const { resolveAutoReplyRule, resolveReplyDelayMs } = require('../middleware/autoReply');
const { processIncomingMessageFlow } = require('../services/flowEngineService');

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
  if (message.image?.link) return message.image.link;
  if (message.button?.text) return message.button.text;
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  return '';
};

const extractIncomingMessageData = (message) => {
  const messageType = message?.type || 'text';
  const parsedTimestamp = parseWebhookTimestamp(message?.timestamp);
  const textBody = extractMessageBody(message);

  if (messageType === 'image') {
    const imageUrl = message?.image?.link || '';
    const imageCaption = message?.image?.caption || '';
    return {
      type: 'image',
      message: imageUrl || imageCaption || textBody || `image:${message?.image?.id || ''}`,
      timestamp: parsedTimestamp,
      messageId: message?.id || '',
    };
  }

  if (messageType === 'button') {
    const isTemplateReply = Boolean(message?.button?.payload);
    return {
      type: isTemplateReply ? 'template_reply' : 'button',
      message: message?.button?.text || textBody,
      replyId: message?.button?.payload || '',
      timestamp: parsedTimestamp,
      messageId: message?.id || '',
    };
  }

  if (messageType === 'interactive') {
    const buttonReply = message?.interactive?.button_reply?.title;
    const listReply = message?.interactive?.list_reply?.title;
    return {
      type: buttonReply ? 'button_reply' : 'template_reply',
      message: buttonReply || listReply || textBody,
      replyId: message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id || '',
      timestamp: parsedTimestamp,
      messageId: message?.id || '',
    };
  }

  return {
    type: messageType || 'text',
    message: textBody,
    replyId: '',
    timestamp: parsedTimestamp,
    messageId: message?.id || '',
  };
};

const saveAndEmitMessage = async (payload) => {
  if (payload.messageId) {
    const existing = await Message.findOne({ messageId: payload.messageId }).lean();
    if (existing) {
      console.log(`[whatsapp] Skipped duplicate message ${payload.messageId}`);
      return { message: existing, isDuplicate: true };
    }
  }

  const savedMessage = await Message.create(payload);
  console.log(`[whatsapp] Saved ${savedMessage.direction || 'unknown'} message ${savedMessage._id}`);
  emitNewMessage(savedMessage.toObject());
  return { message: savedMessage, isDuplicate: false };
};

const upsertContactFromIncomingMessage = async (payload) => {
  const phone = normalizePhone(payload?.from);
  if (!phone) return;

  await Contact.findOneAndUpdate(
    { phone },
    {
      $setOnInsert: {
        phone,
        name: '',
        tags: [],
        customFields: {},
        assignedAgent: '',
      },
      $set: {
        lastMessage: String(payload?.message || payload?.body || payload?.text || ''),
        lastSeen: payload?.timestamp || new Date(),
      },
    },
    { upsert: true, new: false }
  );
};


const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dispatchTextMessage = async ({ to, body }) => {
  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) throw new AppError('Invalid recipient number', 400);

  const response = await axios.post(
    graphUrl,
    { messaging_product: 'whatsapp', to: normalizedTo, type: 'text', text: { body } },
    { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
  );

  const metaMessageId = response?.data?.messages?.[0]?.id || '';

  await saveAndEmitMessage({
    fromMe: true,
    from: WHATSAPP_PHONE_NUMBER_ID || '',
    to: normalizedTo,
    message: body,
    body,
    timestamp: new Date(),
    status: 'sent',
    direction: 'outgoing',
    type: 'text',
    text: body,
    time: new Date(),
    messageId: metaMessageId,
  });

  return response.data;
};

const dispatchTemplateMessage = async ({ to, templateName, language = 'en_US', components = [] }) => {
  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) throw new AppError('Invalid recipient number', 400);

  const response = await axios.post(
    graphUrl,
    {
      messaging_product: 'whatsapp',
      to: normalizedTo,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language },
        components,
      },
    },
    { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' } }
  );

  const metaMessageId = response?.data?.messages?.[0]?.id || '';

  await saveAndEmitMessage({
    fromMe: true,
    from: WHATSAPP_PHONE_NUMBER_ID || '',
    to: normalizedTo,
    message: templateName,
    body: templateName,
    timestamp: new Date(),
    status: 'sent',
    direction: 'outgoing',
    type: 'template',
    text: templateName,
    time: new Date(),
    messageId: metaMessageId,
  });

  return response.data;
};

const normalizeStatus = (rawStatus) => {
  const normalized = String(rawStatus || '').toLowerCase();
  if (['sent', 'delivered', 'read', 'failed'].includes(normalized)) {
    return normalized;
  }
  return '';
};

const parseStatusTimestamp = (timestampInSeconds) => {
  const parsedTimestamp = Number(timestampInSeconds);
  return Number.isNaN(parsedTimestamp) ? new Date() : new Date(parsedTimestamp * 1000);
};

const persistStatusEvents = async (statusEvents = []) => {
  const statusOps = [];
  const messageOps = [];

  for (const statusEvent of statusEvents) {
    const messageId = String(statusEvent?.id || '').trim();
    const status = normalizeStatus(statusEvent?.status);

    if (!messageId || !status) {
      continue;
    }

    const timestamp = parseStatusTimestamp(statusEvent?.timestamp);
    const campaignId = String(statusEvent?.conversation?.id || '').trim();

    statusOps.push({
      updateOne: {
        filter: { messageId, status },
        update: { $setOnInsert: { messageId, status, timestamp, campaignId } },
        upsert: true,
      },
    });

    messageOps.push({
      updateOne: {
        filter: { messageId },
        update: {
          $set: {
            status,
            timestamp,
            time: timestamp,
          },
        },
      },
    });
  }

  if (statusOps.length > 0) {
    await CampaignMessageStatus.bulkWrite(statusOps, { ordered: false });
  }

  if (messageOps.length > 0) {
    await Message.bulkWrite(messageOps, { ordered: false });
  }
};

const sendAutoReplyForIncomingMessage = async (incomingPayload) => {
  if (!incomingPayload || incomingPayload.type !== 'text') return;

  const incomingText = String(incomingPayload.message || '').trim();
  if (!incomingText) return;

  const matchedRule = await resolveAutoReplyRule(incomingText);
  const fallbackReply = String(
    process.env.WHATSAPP_FALLBACK_REPLY || 'Thanks for your message. We will get back to you shortly.'
  ).trim();

  const replyType = matchedRule?.replyType || (fallbackReply ? 'text' : null);
  const reply = matchedRule?.reply || fallbackReply;

  if (!replyType || !reply) {
    return;
  }

  const delayMs = resolveReplyDelayMs(matchedRule);
  if (delayMs > 0) {
    await wait(delayMs);
  }

  if (replyType === 'template') {
    await dispatchTemplateMessage({
      to: incomingPayload.from,
      templateName: reply,
      language: 'en_US',
      components: [],
    });
    return;
  }

  await dispatchTextMessage({
    to: incomingPayload.from,
    body: reply,
  });
};

// ================== SEND TEXT ==================
const sendText = asyncHandler(async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) throw new AppError('to and body are required', 400);

  try {
    const data = await dispatchTextMessage({ to, body });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error("❌ TEXT ERROR:", err.response?.data || err.message);
    return res.status(500).json({ success: false, error: err.response?.data || err.message });
  }
});

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
  console.log("📤 FINAL TEMPLATE PAYLOAD:", JSON.stringify({
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type: 'template',
    template: {
      name: template_name,
      language: { code: language },
      components: finalComponents
    }
  }, null, 2));

  try {
    const data = await dispatchTemplateMessage({
      to: normalizedTo,
      templateName: template_name,
      language,
      components: finalComponents,
    });

    console.log("✅ TEMPLATE SENT SUCCESS:", data);

    return res.status(200).json({
      success: true,
      data
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
    console.log("🔥 WEBHOOK HIT");
    console.log("👉 Headers:", req.headers);
    console.log("👉 Body:", JSON.stringify(req.body, null, 2));
    console.log('[whatsapp] Incoming webhook received');
    const enforceSignature =
  String(process.env.WHATSAPP_ENFORCE_WEBHOOK_SIGNATURE).toLowerCase() !== 'false';

if (enforceSignature && WHATSAPP_APP_SECRET) {
  const signature = req.headers['x-hub-signature-256'];

  if (!req.rawBody) {
    console.error("❌ rawBody missing");
  }

  const expectedSignature =
    'sha256=' +
    crypto
      .createHmac('sha256', WHATSAPP_APP_SECRET)
      .update(req.rawBody)
      .digest('hex');

  if (signature !== expectedSignature) {
    console.error("❌ Signature mismatch");
    console.log("Expected:", expectedSignature);
    console.log("Received:", signature);

    return res.status(403).send("Invalid signature");
  }
}

    const entries = Array.isArray(req.body?.entry) ? req.body.entry : [];
    const incomingPayloads = [];
    const statusPayloads = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];

      for (const change of changes) {
        const value = change?.value || {};
        const messageEvents = value?.messages;
        const statusEvents = Array.isArray(value?.statuses) ? value.statuses : [];

        if (statusEvents.length > 0) {
          statusPayloads.push(...statusEvents);
        }

        if (!Array.isArray(messageEvents)) {
          console.log('[whatsapp] No messages array in webhook payload');
          continue;
        }

        const destinationNumber =
          value?.metadata?.display_phone_number ||
          value?.metadata?.phone_number_id ||
          WHATSAPP_PHONE_NUMBER_ID ||
          '';

        for (const msg of messageEvents) {
          const parsed = extractIncomingMessageData(msg);
          const payload = {
            fromMe: false,
            from: msg?.from || '',
            to: destinationNumber,
            message: parsed.message,
            body: parsed.message,
            timestamp: parsed.timestamp,
            status: 'received',
            direction: 'incoming',
            text: parsed.message,
            time: parsed.timestamp,
            messageId: parsed.messageId,
            type: parsed.type,
            replyId: parsed.replyId,
          };

          console.log(
            `[whatsapp] Message parsed: type=${payload.type} from=${payload.from} messageId=${payload.messageId || 'n/a'}`
          );
          incomingPayloads.push(payload);
        }
      }
    }

    res.status(200).json({ received: true });
    setImmediate(async () => {
      try {
        await persistStatusEvents(statusPayloads);
      } catch (statusError) {
        console.error('[whatsapp] Failed to persist status events:', statusError);
      }

      for (const payload of incomingPayloads) {
        try {
          upsertContactFromIncomingMessage(payload).catch((contactError) => {
            console.error('[whatsapp] Failed to upsert contact:', contactError);
          });

          const { isDuplicate } = await saveAndEmitMessage(payload);
          console.log(
            `[whatsapp] Message saved: type=${payload.type} from=${payload.from} messageId=${payload.messageId || 'n/a'}`
          );
          if (!isDuplicate) {
            try {
              const flowResult = await processIncomingMessageFlow({
                payload,
                sendText: dispatchTextMessage,
              });

              if (!flowResult?.handled) {
                await sendAutoReplyForIncomingMessage(payload);
              }
            } catch (replyError) {
              console.error('[whatsapp] Failed to send auto reply:', replyError);
            }
          }
        } catch (saveError) {
          console.error('[whatsapp] Failed to save incoming message:', saveError);
        }
      }
    });
  } catch (error) {
    console.error('[whatsapp] Webhook error:', error);
    return res.status(200).json({ received: true });
  }
};

const getAnalytics = asyncHandler(async (req, res) => {
  const includeCampaignWise =
    String(req.query.campaignWise || '').toLowerCase() === 'true' ||
    String(req.query.includeCampaignWise || '').toLowerCase() === 'true';

  const [totalSentMessages, deliveredMessages, readMessages, failedMessages] = await Promise.all([
    CampaignMessageStatus.distinct('messageId', { status: 'sent' }),
    CampaignMessageStatus.distinct('messageId', { status: 'delivered' }),
    CampaignMessageStatus.distinct('messageId', { status: 'read' }),
    CampaignMessageStatus.distinct('messageId', { status: 'failed' }),
  ]);

  const totalSent = totalSentMessages.length;
  const deliveredCount = deliveredMessages.length;
  const readCount = readMessages.length;
  const failedCount = failedMessages.length;

  const calculatePercentage = (count) => (totalSent > 0 ? Number(((count / totalSent) * 100).toFixed(2)) : 0);

  const analytics = {
    totalSent,
    deliveredPercentage: calculatePercentage(deliveredCount),
    readPercentage: calculatePercentage(readCount),
    failedPercentage: calculatePercentage(failedCount),
  };

  if (includeCampaignWise) {
    const campaignWise = await CampaignMessageStatus.aggregate([
      { $match: { campaignId: { $ne: '' }, status: { $in: ['sent', 'delivered', 'read', 'failed'] } } },
      {
        $group: {
          _id: '$campaignId',
          sent: { $addToSet: { $cond: [{ $eq: ['$status', 'sent'] }, '$messageId', null] } },
          delivered: { $addToSet: { $cond: [{ $eq: ['$status', 'delivered'] }, '$messageId', null] } },
          read: { $addToSet: { $cond: [{ $eq: ['$status', 'read'] }, '$messageId', null] } },
          failed: { $addToSet: { $cond: [{ $eq: ['$status', 'failed'] }, '$messageId', null] } },
        },
      },
      {
        $project: {
          _id: 0,
          campaignId: '$_id',
          totalSent: {
            $size: { $filter: { input: '$sent', as: 'messageId', cond: { $ne: ['$$messageId', null] } } },
          },
          deliveredCount: {
            $size: { $filter: { input: '$delivered', as: 'messageId', cond: { $ne: ['$$messageId', null] } } },
          },
          readCount: {
            $size: { $filter: { input: '$read', as: 'messageId', cond: { $ne: ['$$messageId', null] } } },
          },
          failedCount: {
            $size: { $filter: { input: '$failed', as: 'messageId', cond: { $ne: ['$$messageId', null] } } },
          },
        },
      },
      { $sort: { campaignId: 1 } },
    ]);

    analytics.campaignWise = campaignWise.map((item) => {
      const base = item.totalSent || 0;
      const toPercent = (count) => (base > 0 ? Number(((count / base) * 100).toFixed(2)) : 0);

      return {
        campaignId: item.campaignId,
        totalSent: base,
        deliveredPercentage: toPercent(item.deliveredCount || 0),
        readPercentage: toPercent(item.readCount || 0),
        failedPercentage: toPercent(item.failedCount || 0),
      };
    });
  }

  return res.status(200).json({ success: true, data: analytics });
});

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
  getAnalytics,
  verifyWebhook,
  receiveWebhook,
};
