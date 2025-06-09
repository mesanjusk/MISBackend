const { Client, RemoteAuth } = require('whatsapp-web.js');
const MongoStore = require('wwebjs-mongo');
const mongoose = require('mongoose');
const WhatsAppSession = require('../Models/WhatsAppSession');
const qrcode = require('qrcode');

let latestQr = null;
let client;
let ready = false;

function setupWhatsApp(io) {
  const store = new MongoStore({
    mongoose: mongoose,
    collectionName: 'sessions',
    idField: 'session',

    get: async () => {
      const record = await WhatsAppSession.findOne();
      return record ? record.data : null;
    },

    set: async (session, data) => {
      await WhatsAppSession.findOneAndUpdate(
        { session },
        { session, data },
        { upsert: true }
      );
    },

    delete: async (session) => {
      await WhatsAppSession.deleteOne({ session });
    }
  });

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      backupSyncIntervalMs: 300000,
      clientId: 'main-client'
    }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr) => {
    latestQr = qr;
    console.log('📲 New QR code generated');
    io.emit('qr', qr);
  });

  client.on('authenticated', () => {
    console.log('🔐 Authenticated');
    io.emit('authenticated');
  });

  client.on('ready', () => {
    console.log('✅ Client is ready');
    ready = true;
    io.emit('ready');
  });

  client.on('auth_failure', msg => {
    console.error('❌ Auth failed:', msg);
    io.emit('auth_failure');
  });

  client.on('disconnected', reason => {
    console.warn('⚠️ Disconnected:', reason);
    ready = false;
    io.emit('disconnected');
  });

  client.on('message', async (msg) => {
    console.log('📩 MESSAGE RECEIVED:', msg.body);
    if (msg.from.includes('@g.us')) return;

    if (msg.body.toLowerCase().includes('hi')) {
      await msg.reply('Hello! 👋');
    }
  });

  client.initialize();
}

function getLatestQR() {
  return latestQr;
}

function isWhatsAppReady() {
  return ready;
}

async function sendMessageToWhatsApp(number, message) {
  if (!ready) throw new Error('WhatsApp client is not ready yet');
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const sentMsg = await client.sendMessage(chatId, message);
  return { success: true, id: sentMsg.id._serialized };
}

module.exports = {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp
};
