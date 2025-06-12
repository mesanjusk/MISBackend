const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcodeTerminal = require('qrcode-terminal');
const Message = require('../Models/Message');

// In-memory map of all active WhatsApp clients
const sessions = {};

function getLatestQR(sessionId = 'default') {
  return sessions[sessionId]?.latestQR || null;
}

function isWhatsAppReady(sessionId = 'default') {
  return sessions[sessionId]?.ready || false;
}

async function setupWhatsApp(io, sessionId = 'default') {
  try {
    if (sessions[sessionId]) {
      console.log(`⚠️ WhatsApp client ${sessionId} already initialized`);
      return;
    }

    await mongoose.connection.asPromise();
    const store = new MongoStore({ mongoose });

    const client = new Client({
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

    sessions[sessionId] = { client, latestQR: null, ready: false };

    client.on('qr', (qr) => {
      sessions[sessionId].latestQR = qr;
      console.log(`📲 New QR code generated for ${sessionId}`);
      qrcodeTerminal.generate(qr, { small: true });
      io.emit('qr', { sessionId, qr });
    });

    client.on('ready', () => {
      sessions[sessionId].ready = true;
      console.log(`✅ Client ${sessionId} is ready`);
      io.emit('ready', sessionId);
    });

    client.on('authenticated', () => {
      console.log(`🔐 Authenticated ${sessionId}`);
      io.emit('authenticated', sessionId);
    });

    client.on('auth_failure', (msg) => {
      console.error(`❌ Authentication failed for ${sessionId}:`, msg);
      io.emit('auth_failure', { sessionId, msg });
    });

    client.on('message', async (msg) => {
      const from = msg.from.replace('@c.us', '');
      const text = msg.body;
      const time = new Date();

      await Message.create({ from, to: sessionId, text, time });

      io.emit('message', {
        sessionId,
        number: from,
        message: text,
        time,
      });

      console.log(`📩 MESSAGE RECEIVED (${sessionId}):`, text);
    });

    client.initialize();
  } catch (err) {
    console.error(`❌ Failed to initialize ${sessionId}:`, err);
  }
}

async function sendMessageToWhatsApp(number, message, sessionId = 'default') {
  const session = sessions[sessionId];
  if (!session || !session.ready) {
    throw new Error('WhatsApp client is not ready yet');
  }

  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const sentMessage = await session.client.sendMessage(chatId, message);

  await Message.create({
    from: sessionId,
    to: number,
    text: message,
    time: new Date(),
  });

  return { success: true, id: sentMessage.id._serialized };
}

function listSessions() {
  return Object.keys(sessions).map((id) => ({
    sessionId: id,
    ready: sessions[id].ready,
  }));
}

async function logoutSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) return false;

  try {
    await session.client.destroy();
  } catch (e) {
    console.error(`Failed to destroy client ${sessionId}:`, e);
  }

  delete sessions[sessionId];
  return true;
}

module.exports = {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
  listSessions,
  logoutSession,
};
