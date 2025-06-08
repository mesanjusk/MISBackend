const { Client } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');

const mongoUrl = 'mongodb+srv://sanjuahuja:cY7NtMKm8M10MbUs@cluster0.wdfsd.mongodb.net/framee';

mongoose.connect(mongoUrl, { useNewUrlParser: true, useUnifiedTopology: true });

const store = new MongoStore({ mongoose: mongoose });

let client;
let latestQr = null;
let isReady = false;

function setupWhatsApp(io) {
  client = new Client({
    authStrategy: store,
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    latestQr = qr;
    isReady = false;
    io.emit('qr', qr);
    console.log('📲 New QR code generated');
  });

  client.on('ready', () => {
    isReady = true;
    latestQr = null;
    io.emit('ready');
    console.log('✅ Client is ready');
  });

  client.on('authenticated', () => {
    io.emit('authenticated');
    console.log('🔐 Authenticated');
  });

  client.on('auth_failure', (msg) => {
    isReady = false;
    io.emit('auth_failure');
    console.error('❌ Auth failed:', msg);
  });

  client.on('disconnected', (reason) => {
    isReady = false;
    io.emit('disconnected');
    console.warn('⚠️ Disconnected:', reason);
  });

  // Example auto reply (can remove if not needed)
  client.on('message', async msg => {
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

async function sendMessageToWhatsApp(number, message) {
  if (!isReady) throw new Error('WhatsApp client is not ready yet');
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const sentMsg = await client.sendMessage(chatId, message);
  return { success: true, id: sentMsg.id._serialized };
}

function isWhatsAppReady() {
  return isReady;
}

module.exports = {
  setupWhatsApp,
  sendMessageToWhatsApp,
  getLatestQR,
  isWhatsAppReady,
};
