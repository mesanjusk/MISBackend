const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const axios = require('axios');
const crypto = require('crypto');
const { v4: uuid } = require('uuid');
const Message = require('../repositories/Message');
const CampaignMessageStatus = require('../repositories/CampaignMessageStatus');
const Contact = require('../repositories/contact');
const Customers = require('../repositories/customer');
const Enquiry = require('../repositories/enquiry');
const User = require('../repositories/users');
const { markAttendance } = require('../services/attendanceService');
const { emitNewMessage } = require('../socket');
const { resolveAutoReplyRule, resolveReplyDelayMs } = require('../middleware/autoReply');
const { processIncomingMessageFlow } = require('../services/flowEngineService');
const { uploadWhatsAppMediaToCloudinary } = require('../services/whatsappMediaService');

const {
  WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_API_VERSION,
  WHATSAPP_APP_SECRET,
} = process.env;

const SUPPORTED_INCOMING_TYPES = new Set(['text', 'image', 'video', 'document', 'audio', 'sticker']);
const RESOLVED_API_VERSION = WHATSAPP_API_VERSION || 'v19.0';
const normalizePhone = (to) => String(to || '').replace(/\D/g, '');
const graphUrl = `https://graph.facebook.com/${RESOLVED_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`;

const parseWebhookTimestamp = (timestampInSeconds) => {
  const parsedTimestamp = Number(timestampInSeconds);
  return Number.isNaN(parsedTimestamp) ? new Date() : new Date(parsedTimestamp * 1000);
};

const extractIncomingMessageData = (message = {}) => {
  const messageType = String(message?.type || 'text').toLowerCase();
  const normalized = {
    type: messageType,
    from: String(message?.from || ''),
    timestamp: message?.timestamp || '',
    messageId: String(message?.id || ''),
    content: '',
    mediaId: '',
    caption: '',
    filename: '',
    mimeType: '',
  };

  if (messageType === 'text') {
    normalized.content = String(message?.text?.body || '');
    return normalized;
  }

  if (messageType === 'image' || messageType === 'video' || messageType === 'audio' || messageType === 'sticker') {
    const mediaNode = message?.[messageType] || {};
    normalized.mediaId = String(mediaNode?.id || '');
    normalized.caption = String(mediaNode?.caption || '');
    normalized.mimeType = String(mediaNode?.mime_type || '');
    return normalized;
  }

  if (messageType === 'document') {
    const mediaNode = message?.document || {};
    normalized.mediaId = String(mediaNode?.id || '');
    normalized.caption = String(mediaNode?.caption || '');
    normalized.filename = String(mediaNode?.filename || '');
    normalized.mimeType = String(mediaNode?.mime_type || '');
    return normalized;
  }

  return null;
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

const computeConversationWindow = (lastCustomerMessageAt) => {
  if (!lastCustomerMessageAt) return { lastCustomerMessageAt: null, windowOpen: false };
  const last = new Date(lastCustomerMessageAt);
  const windowOpen = Date.now() - last.getTime() < 24 * 60 * 60 * 1000;
  return { lastCustomerMessageAt: last, windowOpen };
};

const upsertContactFromIncomingMessage = async (payload) => {
  const phone = normalizePhone(payload?.from);
  if (!phone) return;

  const conversation = computeConversationWindow(payload?.timestamp || new Date());

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
        conversation,
      },
    },
    { upsert: true, new: false }
  );
};

const upsertCustomerAndEnquiryFromIncomingMessage = async (payload) => {
  const phone = normalizePhone(payload?.from);
  if (!phone) return { customer: null, createdEnquiry: false };

  const existingCustomer = await Customers.findOne({ Mobile_number: phone }).lean();
  if (existingCustomer) {
    await Customers.updateOne(
      { _id: existingCustomer._id },
      { $set: { LastInteraction: payload?.timestamp || new Date() } }
    );
    return { customer: existingCustomer, createdEnquiry: false };
  }

  const customerName = `WhatsApp ${phone.slice(-4)}`;
  const customerDoc = await Customers.create({
    Customer_uuid: uuid(),
    Customer_name: customerName,
    Mobile_number: phone,
    Customer_group: 'Customer',
    Status: 'active',
    Tags: ['whatsapp'],
    LastInteraction: payload?.timestamp || new Date(),
  });

  const lastEnquiry = await Enquiry.findOne().sort({ Enquiry_Number: -1 }).lean();
  const newEnquiryNumber = lastEnquiry ? lastEnquiry.Enquiry_Number + 1 : 1;
  await Enquiry.create({
    Enquiry_uuid: `WA-${Date.now()}-${phone}`,
    Enquiry_Number: newEnquiryNumber,
    Customer_name: customerDoc.Customer_name,
    Priority: 'Normal',
    Item: 'WhatsApp Enquiry',
    Task: 'Enquiry',
    Assigned: 'System',
    Delivery_Date: new Date(),
    Remark: String(payload?.message || payload?.body || 'Auto created from WhatsApp').slice(0, 2000),
  });

  return { customer: customerDoc.toObject ? customerDoc.toObject() : customerDoc, createdEnquiry: true };
};

const findEmployeeByWhatsAppNumber = async (rawPhone) => {
  const normalizePhoneForLookup = (phone) => String(phone || '').replace(/\D/g, '');
  const normalizedPhone = normalizePhoneForLookup(rawPhone); // 919372333633
  if (!normalizedPhone) return null;

  const last10 = normalizedPhone.slice(-10); // 9372333633
  const last10Number = Number(last10);

  console.log('Incoming:', rawPhone);
  console.log('Normalized:', normalizedPhone);
  console.log('Last10:', last10);
  console.log('Last10Number:', last10Number);

  return User.findOne({
    $or: [
      { phone: normalizedPhone },
      { phone: `+${normalizedPhone}` },
      { phone: last10 },

      { Mobile_number: last10Number },

      { Mobile_number: last10 },
      {
        $expr: {
          $eq: [{ $toString: '$Mobile_number' }, last10],
        },
      },
    ],
  });
};

const markWhatsAppStartAttendance = async (payload) => {
  const incomingText = String(payload?.message || '').trim().toLowerCase();
  const isAttendanceTrigger = payload?.type === 'text' && (incomingText === 'start' || incomingText === 'hi');
  if (!isAttendanceTrigger) return { handled: false };

  try {
    const employee = await findEmployeeByWhatsAppNumber(payload?.from);
    console.log('Employee found:', employee?._id);
    const eventTime = new Date();
    const employeeUuid = String(employee?.User_uuid || employee?._id || '');

    if (!employee || !employeeUuid) {
      await dispatchTextMessage({
        to: payload.from,
        body: 'Your number is not registered. Contact admin.',
      });
      return { handled: true };
    }

    const attendanceResult = await markAttendance({
      employeeUuid,
      type: 'In',
      status: 'Active',
      source: 'whatsapp',
      createdAt: eventTime,
    });

    await User.updateOne(
      { _id: employee._id },
      { $set: { lastCustomerMessageAt: eventTime } }
    );

    if (attendanceResult.created) {
      const today = new Date();
      const formattedDate = `${String(today.getDate()).padStart(2, '0')}:${String(today.getMonth() + 1).padStart(2, '0')}:${today.getFullYear()}`;

      try {
        await dispatchTemplateMessage({
          to: payload.from,
          templateName: 'attendance_confirmation',
          language: 'en_US',
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: employee.name || employee.User_name || 'User' },
                { type: 'text', text: formattedDate },
              ],
            },
          ],
        });
      } catch (err) {
        await dispatchTextMessage({
          to: payload.from,
          body: '✅ Attendance marked successfully.',
        });
      }
    } else {
      await dispatchTextMessage({
        to: payload.from,
        body: 'ℹ️ You already marked attendance today.',
      });
    }

    return { handled: true };
  } catch (error) {
    console.error('[whatsapp] Failed to process START/HI attendance:', error);
    return { handled: false };
  }
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const dispatchTextMessage = async ({ to, body }) => {
  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) throw new AppError('Invalid recipient number', 400);

  const response = await axios.post(
    graphUrl,
    {
      messaging_product: 'whatsapp',
      to: normalizedTo,
      type: 'text',
      text: { body },
    },
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

const dispatchMediaMessage = async ({ to, type, link, caption = '', filename = '' }) => {
  const normalizedTo = normalizePhone(to);
  if (!normalizedTo) throw new AppError('Invalid recipient number', 400);

  const allowedTypes = new Set(['image', 'video', 'audio', 'document']);
  if (!allowedTypes.has(type)) {
    throw new AppError('Unsupported media type for sending', 400);
  }

  const mediaNode = { link };
  if (caption && (type === 'image' || type === 'video' || type === 'document')) {
    mediaNode.caption = caption;
  }
  if (filename && type === 'document') {
    mediaNode.filename = filename;
  }

  const payload = {
    messaging_product: 'whatsapp',
    to: normalizedTo,
    type,
    [type]: mediaNode,
  };

  const response = await axios.post(graphUrl, payload, {
    headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  });

  const metaMessageId = response?.data?.messages?.[0]?.id || '';

  await saveAndEmitMessage({
    fromMe: true,
    from: WHATSAPP_PHONE_NUMBER_ID || '',
    to: normalizedTo,
    message: caption || link,
    body: caption || link,
    timestamp: new Date(),
    status: 'sent',
    direction: 'outgoing',
    type,
    text: caption || '',
    mediaUrl: link,
    caption,
    filename,
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

const processIncomingMediaMessage = async ({ messageRecordId, mediaId }) => {
  if (!messageRecordId || !mediaId) return;

  try {
    const uploaded = await uploadWhatsAppMediaToCloudinary({
      mediaId,
      accessToken: WHATSAPP_ACCESS_TOKEN,
      graphVersion: RESOLVED_API_VERSION,
    });

    const updated = await Message.findByIdAndUpdate(
      messageRecordId,
      {
        $set: {
          mediaUrl: uploaded.mediaUrl,
          mimeType: uploaded.mimeType,
          message: uploaded.mediaUrl,
          body: uploaded.mediaUrl,
        },
      },
      { new: true }
    ).lean();

    if (updated) {
      emitNewMessage(updated);
      console.log(`[whatsapp] Media processed for message=${messageRecordId} mediaId=${mediaId}`);
    }
  } catch (error) {
    console.error(`[whatsapp] Media processing failed for mediaId=${mediaId}:`, error.message);
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

const sendText = asyncHandler(async (req, res) => {
  const { to, body } = req.body;
  if (!to || !body) throw new AppError('to and body are required', 400);

  const data = await dispatchTextMessage({ to, body });
  return res.status(200).json({ success: true, data });
});

const sendTemplate = asyncHandler(async (req, res) => {
  const {
    to,
    template_name,
    language = 'en_US',
    components = [],
  } = req.body;

  if (!to || !template_name) {
    throw new AppError('to and template_name are required', 400);
  }

  if (!components.length) {
    throw new AppError('Template parameters missing', 400);
  }

  const finalComponents = components.map((comp) => {
    if (comp.type === 'body') {
      return {
        ...comp,
        parameters: (comp.parameters || []).filter((p) => p.text && p.text.trim() !== ''),
      };
    }
    return comp;
  });

  const data = await dispatchTemplateMessage({
    to,
    templateName: template_name,
    language,
    components: finalComponents,
  });

  return res.status(200).json({ success: true, data });
});

const sendMedia = asyncHandler(async (req, res) => {
  const { to, type, link, caption, filename } = req.body;
  if (!to || !type || !link) {
    throw new AppError('to, type and link are required', 400);
  }

  const data = await dispatchMediaMessage({ to, type, link, caption, filename });
  return res.status(200).json({ success: true, data });
});

const sendMessage = asyncHandler(async (req, res) => {
  const { to, type } = req.body;
  if (!to || !type) throw new AppError('to and type are required', 400);

  let data;
  if (type === 'text') {
    if (!req.body.text) throw new AppError('text is required for text type', 400);
    data = await dispatchTextMessage({ to, body: req.body.text });
  } else if (type === 'image') {
    if (!req.body.imageUrl) throw new AppError('imageUrl is required for image type', 400);
    data = await dispatchMediaMessage({ to, type: 'image', link: req.body.imageUrl, caption: req.body.caption || '' });
  } else if (type === 'document') {
    if (!req.body.documentUrl) throw new AppError('documentUrl is required for document type', 400);
    data = await dispatchMediaMessage({
      to,
      type: 'document',
      link: req.body.documentUrl,
      filename: req.body.filename || 'document',
      caption: req.body.caption || '',
    });
  } else {
    throw new AppError('Unsupported type. Use text, image or document', 400);
  }

  return res.status(200).json({ success: true, data });
});

const getTemplates = asyncHandler(async (_req, res) => {
  const response = await axios.get(
    `https://graph.facebook.com/${RESOLVED_API_VERSION}/${process.env.WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates`,
    { headers: { Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}` } }
  );

  return res.status(200).json({
    success: true,
    templates: response.data.data || [],
  });
});

const getMessages = asyncHandler(async (req, res) => {
  const sortOrder = String(req.query.sort || '').toLowerCase();
  const includeUiFields = String(req.query.includeUiFields || '').toLowerCase() === 'true';
  const includeUnreadCount = String(req.query.includeUnreadCount || '').toLowerCase() === 'true';

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
    const enforceSignature =
      String(process.env.WHATSAPP_ENFORCE_WEBHOOK_SIGNATURE).toLowerCase() !== 'false';

    if (enforceSignature && WHATSAPP_APP_SECRET) {
      const signature = String(req.headers['x-hub-signature-256'] || '');

      if (!req.rawBody || !signature.startsWith('sha256=')) {
        console.error('[whatsapp] Missing rawBody or signature header');
        return res.status(403).send('Invalid signature');
      }

      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', WHATSAPP_APP_SECRET)
          .update(req.rawBody)
          .digest('hex');

      const isValidSignature = (() => {
        try {
          return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
        } catch (_error) {
          return false;
        }
      })();

      if (!isValidSignature) {
        console.error('[whatsapp] Signature mismatch');
        return res.status(403).send('Invalid signature');
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

        if (!Array.isArray(messageEvents)) continue;

        const destinationNumber =
          value?.metadata?.display_phone_number ||
          value?.metadata?.phone_number_id ||
          WHATSAPP_PHONE_NUMBER_ID ||
          '';

        for (const msg of messageEvents) {
          if (!SUPPORTED_INCOMING_TYPES.has(String(msg?.type || 'text').toLowerCase())) {
            console.warn(`[whatsapp] Unsupported message payload type=${msg?.type || 'unknown'} id=${msg?.id || 'n/a'}`);
            continue;
          }

          const normalized = extractIncomingMessageData(msg);
          if (!normalized) {
            console.warn(`[whatsapp] Failed to normalize payload id=${msg?.id || 'n/a'}`);
            continue;
          }

          const parsedTimestamp = parseWebhookTimestamp(normalized.timestamp);
          const payload = {
            fromMe: false,
            from: normalized.from || msg?.from || '',
            to: destinationNumber,
            message: normalized.type === 'text' ? normalized.content : normalized.caption || normalized.mediaId,
            body: normalized.type === 'text' ? normalized.content : normalized.caption || normalized.mediaId,
            timestamp: parsedTimestamp,
            status: 'received',
            direction: 'incoming',
            text: normalized.type === 'text' ? normalized.content : '',
            time: parsedTimestamp,
            messageId: normalized.messageId,
            type: normalized.type,
            mediaId: normalized.mediaId,
            caption: normalized.caption,
            filename: normalized.filename,
            mimeType: normalized.mimeType,
            mediaUrl: '',
          };

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
          const customerSync = await upsertCustomerAndEnquiryFromIncomingMessage(payload).catch((customerError) => {
            console.error('[whatsapp] Failed to sync customer/enquiry:', customerError);
            return null;
          });
          if (customerSync?.customer) {
            payload.customerUuid = String(customerSync.customer.Customer_uuid || '');
            payload.customerId = String(customerSync.customer._id || '');
          }

          const { message: savedMessage, isDuplicate } = await saveAndEmitMessage(payload);

          if (!isDuplicate && payload.mediaId) {
            setImmediate(() => {
              processIncomingMediaMessage({
                messageRecordId: savedMessage._id,
                mediaId: payload.mediaId,
              });
            });
          }

          if (!isDuplicate && payload.type === 'text') {
            try {
              const attendanceTriggerResult = await markWhatsAppStartAttendance(payload);
              if (attendanceTriggerResult.handled) {
                continue;
              }

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
  sendMedia,
  sendMessage,
  getTemplates,
  getMessages,
  getAnalytics,
  verifyWebhook,
  receiveWebhook,
}; 
