const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const qrcodeTerminal = require('qrcode-terminal');

let client;
let latestQR = null;
let ready = false;

function getLatestQR() {
  return latestQR;
}

function isWhatsAppReady() {
  return ready;
}

async function setupWhatsApp(io) {
  try {
    // Ensure MongoDB connection is ready
    await mongoose.connection.asPromise();

    // Create MongoStore for RemoteAuth
    const store = new MongoStore({ mongoose });


    client = new Client({
      authStrategy: new RemoteAuth({
        store,
        backupSyncIntervalMs: 300000, // optional
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    client.on('qr', (qr) => {
      latestQR = qr;
      console.log("📲 New QR code generated");
      qrcodeTerminal.generate(qr, { small: true });
      io.emit('qr', qr);
    });

    client.on('ready', () => {
      ready = true;
      console.log("✅ Client is ready");
      io.emit('ready');
    });

    client.on('authenticated', () => {
      console.log("🔐 Authenticated");
      io.emit('authenticated');
    });

    client.on('auth_failure', (msg) => {
      console.error("❌ Authentication failed:", msg);
      io.emit('auth_failure', msg);
    });

    client.on('message', async (msg) => {
      console.log("📩 MESSAGE RECEIVED:", msg.body);
      io.emit('message', msg.body);
    });

    client.initialize();
  } catch (err) {
    console.error("❌ Failed to initialize:", err);
  }
}

async function sendMessageToWhatsApp(number, message) {
  if (!client || !ready) throw new Error("WhatsApp client is not ready yet");

  const chatId = number.includes('@c.us') ? number : number + "@c.us";
  const sentMessage = await client.sendMessage(chatId, message);
  return { success: true, id: sentMessage.id._serialized };
}

module.exports = {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
};
