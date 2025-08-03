const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcode = require('qrcode');
const Message = require('../Models/Message');

let client;
let latestQR = null;
let isReady = false;

/**
 * Initialize WhatsApp client with MongoDB RemoteAuth
 */
async function setupWhatsApp(io, sessionId = 'default') {
  if (client) {
    console.log(`⚠️ WhatsApp client already initialized`);
    return;
  }

  await mongoose.connection.asPromise();
  const store = new MongoStore({ mongoose });

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      clientId: sessionId,
      backupSyncIntervalMs: 300000,
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', async (qr) => {
    latestQR = await qrcode.toDataURL(qr); // Convert to base64
    console.log(`📲 New QR code generated`);
    io.emit('qr', latestQR); // optional if using socket frontend
  });

  client.on('ready', () => {
    isReady = true;
    latestQR = null;
    console.log('✅ WhatsApp client is ready');
    io.emit('ready');
  });

  client.on('authenticated', () => {
    console.log('🔐 Authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
    io.emit('auth_failure', msg);
  });

  client.on('message', async (msg) => {
    const from = msg.from.replace('@c.us', '');
    const text = msg.body;
    const time = new Date();

    await Message.create({ from, to: sessionId, text, time });

    io.emit('message', { from, message: text, time });
    console.log(`📩 Message received from ${from}: ${text}`);
  });

  client.on('disconnected', (reason) => {
    console.warn('🔌 WhatsApp disconnected:', reason);
    isReady = false;
    latestQR = null;
  });

  await client.initialize();
}

/**
 * Get latest base64 QR string
 */
function getQR() {
  return latestQR;
}

/**
 * Get whether WhatsApp is ready
 */
function getReadyStatus() {
  return isReady;
}

/**
 * Send a test message to a WhatsApp number
 */
async function sendTestMessage(number, message) {
  if (!client || !isReady) {
    throw new Error('WhatsApp client is not ready yet');
  }

  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const sent = await client.sendMessage(chatId, message);

  await Message.create({
    from: 'default',
    to: number,
    text: message,
    time: new Date(),
  });

  return { success: true, id: sent.id._serialized };
}

module.exports = {
  setupWhatsApp,
  getQR,
  getReadyStatus,
  sendTestMessage,
};
