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
    // If session already exists, check if it’s stale
    if (sessions[sessionId]) {
      const session = sessions[sessionId];

      const isStale =
        !session.client?.info || !session.client.info?.wid || !session.ready;

      if (!isStale) {
        console.log(`⚠️ WhatsApp client ${sessionId} already initialized`);
        // Re-emit QR or ready status to frontend
        if (session.latestQR) io.emit('qr', { sessionId, qr: session.latestQR });
        else if (session.ready) io.emit('ready', sessionId);
        return;
      }

      console.log(`🔁 Detected stale session. Resetting ${sessionId}...`);
      await logoutSession(sessionId);
    }

    // Mongo and store setup
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

    // Save session reference
    sessions[sessionId] = {
      client,
      latestQR: null,
      ready: false,
      lastQRTime: null,
      lastMessageTime: null,
    };

    // Event: QR
    client.on('qr', (qr) => {
      sessions[sessionId].latestQR = qr;
      sessions[sessionId].lastQRTime = Date.now();
      console.log(`📲 New QR code generated for ${sessionId}`);
      qrcodeTerminal.generate(qr, { small: true });
      io.emit('qr', { sessionId, qr });
    });

    // Event: Ready
    client.on('ready', () => {
      sessions[sessionId].ready = true;
      console.log(`✅ WhatsApp ${sessionId} is ready`);
      io.emit('ready', sessionId);
    });

    // Event: Authenticated
    client.on('authenticated', () => {
      sessions[sessionId].latestQR = null;
      console.log(`🔐 Authenticated ${sessionId}`);
      io.emit('authenticated', sessionId);
    });

    // Event: Auth failure
    client.on('auth_failure', (msg) => {
      console.error(`❌ Authentication failed for ${sessionId}:`, msg);
      io.emit('auth_failure', { sessionId, msg });
    });

    // Event: Disconnected
    client.on('disconnected', (reason) => {
      console.warn(`🔌 WhatsApp ${sessionId} disconnected: ${reason}`);
      sessions[sessionId].ready = false;
      io.emit('disconnected', { sessionId, reason });
    });

    // Event: Incoming message
    client.on('message', async (msg) => {
      const from = msg.from.replace('@c.us', '');
      const text = msg.body;
      const time = new Date();

      sessions[sessionId].lastMessageTime = Date.now();

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
    lastQRTime: sessions[id].lastQRTime,
    lastMessageTime: sessions[id].lastMessageTime,
  }));
}

async function logoutSession(sessionId) {
  const session = sessions[sessionId];
  if (!session) return false;

  try {
    await session.client.destroy();
  } catch (e) {
    console.error(`⚠️ Failed to destroy client ${sessionId}:`, e);
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
