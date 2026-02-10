const AppError = require('../utils/AppError');

let axiosClient;
const getAxios = () => {
  if (!axiosClient) {
    try {
      // Lazy load so app can boot even when axios optional transitive deps are missing in restricted envs
      axiosClient = require('axios');
    } catch (error) {
      throw new AppError(`Axios is required for Meta API calls: ${error.message}`, 500);
    }
  }

  return axiosClient;
};

const META_API_VERSION = process.env.META_API_VERSION || 'v18.0';
const GRAPH_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

const parseMetaError = (error) => {
  const metaError = error.response?.data?.error;
  if (!metaError) {
    return new AppError(error.message || 'Meta API request failed', error.response?.status || 500);
  }

  const message = `Meta API Error: ${metaError.message} (type=${metaError.type}, code=${metaError.code})`;
  const appError = new AppError(message, error.response?.status || 502);
  appError.meta = metaError;
  return appError;
};

const httpGet = async (url, params) => {
  try {
    const response = await getAxios().get(url, { params, timeout: 30000 });
    return response.data;
  } catch (error) {
    throw parseMetaError(error);
  }
};

const httpPost = async (url, payload, headers = {}) => {
  try {
    const response = await getAxios().post(url, payload, {
      headers,
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    throw parseMetaError(error);
  }
};

const exchangeCodeForShortLivedToken = async ({ code, redirectUri }) => {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;

  if (!clientId || !clientSecret) {
    throw new AppError('META_APP_ID and META_APP_SECRET are required', 500);
  }

  return httpGet(`${GRAPH_BASE}/oauth/access_token`, {
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
};

const exchangeForLongLivedToken = async (shortLivedToken) => {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;

  return httpGet(`${GRAPH_BASE}/oauth/access_token`, {
    grant_type: 'fb_exchange_token',
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortLivedToken,
  });
};

const fetchBusinesses = async (accessToken) =>
  httpGet(`${GRAPH_BASE}/me/businesses`, {
    fields: 'id,name',
    access_token: accessToken,
  });

const fetchWabaForBusiness = async (businessId, accessToken) =>
  httpGet(`${GRAPH_BASE}/${businessId}/owned_whatsapp_business_accounts`, {
    fields: 'id,name,phone_numbers{id,display_phone_number,verified_name}',
    access_token: accessToken,
  });

const sendMessage = async ({ phoneNumberId, accessToken, payload }) =>
  httpPost(
    `${GRAPH_BASE}/${phoneNumberId}/messages`,
    payload,
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    }
  );

const fetchTemplates = async ({ wabaId, accessToken }) =>
  httpGet(`${GRAPH_BASE}/${wabaId}/message_templates`, {
    fields: 'id,name,status,language,category,components',
    access_token: accessToken,
    limit: 200,
  });

module.exports = {
  parseMetaError,
  exchangeCodeForShortLivedToken,
  exchangeForLongLivedToken,
  fetchBusinesses,
  fetchWabaForBusiness,
  sendMessage,
  fetchTemplates,
};
