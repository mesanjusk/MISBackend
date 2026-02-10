const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/AppError');
const WhatsAppAccount = require('../repositories/whatsappAccount');
const { encrypt } = require('../utils/crypto');
const {
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchBusinesses,
  fetchWabaForBusiness,
} = require('../services/metaApiService');
const {
  sendTextMessage,
  sendTemplateMessage,
  sendMediaMessage,
  syncApprovedTemplates,
} = require('../services/whatsappMessageService');

const pickEmbeddedSignupTargets = ({ businesses, selectedBusinessId, selectedWabaId, selectedPhoneNumberId }) => {
  const selectedBusiness = businesses.find((b) => b.id === selectedBusinessId) || businesses[0];
  if (!selectedBusiness) {
    throw new AppError('No business portfolio found for this Meta user', 400);
  }

  const selectedWaba =
    selectedBusiness.wabas.find((item) => item.id === selectedWabaId) || selectedBusiness.wabas[0];
  if (!selectedWaba) {
    throw new AppError('No WhatsApp Business Account found under selected business', 400);
  }

  const selectedPhone =
    selectedWaba.phone_numbers?.find((item) => item.id === selectedPhoneNumberId) ||
    selectedWaba.phone_numbers?.[0];

  if (!selectedPhone) {
    throw new AppError('No phone number is linked to selected WABA', 400);
  }

  return {
    businessId: selectedBusiness.id,
    wabaId: selectedWaba.id,
    phoneNumberId: selectedPhone.id,
    displayName: selectedPhone.verified_name || selectedPhone.display_phone_number || selectedWaba.name,
  };
};

const exchangeMetaToken = asyncHandler(async (req, res) => {
  const { code, redirectUri, businessId, wabaId, phoneNumberId, displayName } = req.body;

  if (!code || !redirectUri) {
    throw new AppError('code and redirectUri are required', 400);
  }

  const shortLivedTokenData = await exchangeCodeForShortLivedToken({ code, redirectUri });
  const longLivedTokenData = await exchangeForLongLivedToken(shortLivedTokenData.access_token);

  const businesses = await fetchBusinesses(longLivedTokenData.access_token);
  const hydratedBusinesses = [];

  for (const business of businesses.data || []) {
    const wabas = await fetchWabaForBusiness(business.id, longLivedTokenData.access_token);
    hydratedBusinesses.push({ ...business, wabas: wabas.data || [] });
  }

  const selected = pickEmbeddedSignupTargets({
    businesses: hydratedBusinesses,
    selectedBusinessId: businessId,
    selectedWabaId: wabaId,
    selectedPhoneNumberId: phoneNumberId,
  });

  const expiresIn = Number(longLivedTokenData.expires_in || 60 * 24 * 60 * 60);

  const account = await WhatsAppAccount.findOneAndUpdate(
    { userId: req.user.id, phoneNumberId: selected.phoneNumberId },
    {
      userId: req.user.id,
      businessId: selected.businessId,
      wabaId: selected.wabaId,
      phoneNumberId: selected.phoneNumberId,
      displayName: displayName || selected.displayName,
      accessToken: encrypt(longLivedTokenData.access_token),
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    message: 'WhatsApp account linked successfully',
    account,
  });
});

const listAccounts = asyncHandler(async (req, res) => {
  const accounts = await WhatsAppAccount.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.status(200).json({ success: true, data: accounts });
});

const deleteAccount = asyncHandler(async (req, res) => {
  const deleted = await WhatsAppAccount.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
  if (!deleted) throw new AppError('Account not found', 404);

  res.status(200).json({ success: true, message: 'WhatsApp account removed' });
});

const sendText = asyncHandler(async (req, res) => {
  const { accountId, to, body, customerLastMessageAt } = req.body;

  if (!accountId || !to || !body) {
    throw new AppError('accountId, to and body are required', 400);
  }

  const data = await sendTextMessage({
    accountId,
    userId: req.user.id,
    to,
    body,
    customerLastMessageAt,
  });

  res.status(200).json({ success: true, data });
});

const sendTemplate = asyncHandler(async (req, res) => {
  const { accountId, to, templateName, languageCode, components } = req.body;
  if (!accountId || !to || !templateName) {
    throw new AppError('accountId, to and templateName are required', 400);
  }

  const data = await sendTemplateMessage({
    accountId,
    userId: req.user.id,
    to,
    templateName,
    languageCode,
    components,
  });

  res.status(200).json({ success: true, data });
});

const sendMedia = asyncHandler(async (req, res) => {
  const { accountId, to, mediaType, mediaId, link, caption } = req.body;

  if (!accountId || !to || !mediaType || (!mediaId && !link)) {
    throw new AppError('accountId, to, mediaType and mediaId|link are required', 400);
  }

  const data = await sendMediaMessage({
    accountId,
    userId: req.user.id,
    to,
    mediaType,
    mediaId,
    link,
    caption,
  });

  res.status(200).json({ success: true, data });
});

const getTemplates = asyncHandler(async (req, res) => {
  const { accountId } = req.query;
  if (!accountId) {
    throw new AppError('accountId query param is required', 400);
  }

  const templates = await syncApprovedTemplates({ accountId, userId: req.user.id });
  res.status(200).json({ success: true, data: templates });
});

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

const receiveWebhook = asyncHandler(async (req, res) => {
  const body = req.body;
  const events = [];

  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      for (const message of value.messages || []) {
        events.push({
          type: 'message_received',
          from: message.from,
          messageId: message.id,
          timestamp: message.timestamp,
          messageType: message.type,
          text: message.text?.body,
        });
      }

      for (const status of value.statuses || []) {
        events.push({
          type: 'message_status',
          status: status.status,
          recipientId: status.recipient_id,
          messageId: status.id,
          timestamp: status.timestamp,
          errors: status.errors || [],
        });
      }
    }
  }

  console.log('WhatsApp webhook events:', JSON.stringify(events));

  return res.status(200).json({ received: true });
});

module.exports = {
  exchangeMetaToken,
  listAccounts,
  deleteAccount,
  sendText,
  sendTemplate,
  sendMedia,
  getTemplates,
  verifyWebhook,
  receiveWebhook,
};
