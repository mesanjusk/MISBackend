const { Client } = require('whatsapp-web.js');
const mongoose = require('mongoose');
const WhatsAppSession = require('../Models/WhatsAppSession');


let client;
let latestQr = null;
let clientReady = false;

function setupWhatsApp(io) {
  const store = {
    async save(session) {
      await Session.deleteMany(); // Single session
      await new Session({ session }).save();
    },
    async get() {
      const record = await Session.findOne();
      return record ? record.session : null;
    },
    async delete() {
      await Session.deleteMany();
    },
  };

  (async () => {
    const sessionData = await store.get();

    client = new Client({
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      authStrategy: {
        setup: (clientInstance) => {
          clientInstance.on('authenticated', async (session) => {
            await store.save(session);
            io.emit('authenticated');
            clientReady = true;
            console.log('🔐 Authenticated');
          });

          clientInstance.on('auth_failure', () => {
            io.emit('auth_failure');
            console.log('❌ Authentication failed');
          });

          clientInstance.on('disconnected', async () => {
            await store.delete();
            io.emit('disconnected');
            clientReady = false;
            console.log('⚠️ Disconnected');
          });

          if (sessionData) clientInstance.options.session = sessionData;
        },
      },
    });

    client.on('qr', (qr) => {
      latestQr = qr;
      io.emit('qr', qr);
      console.log('📲 New QR code generated');
    });

    client.on('ready', () => {
      clientReady = true;
      console.log('✅ Client is ready');
      io.emit('ready');
    });

    client.on('message', async (msg) => {
      console.log('📩 MESSAGE RECEIVED:', msg.body);
    });

    await client.initialize();
  })();
}

function getLatestQR() {
  return latestQr;
}

function isWhatsAppReady() {
  return clientReady;
}

async function sendMessageToWhatsApp(number, message) {
  if (!clientReady) throw new Error('WhatsApp client is not ready yet');
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const sentMsg = await client.sendMessage(chatId, message);
  return { success: true, id: sentMsg.id._serialized };
}

module.exports = {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
};
