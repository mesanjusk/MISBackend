const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

let ioInstance = null;
let latestQr = null;

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'client-one' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Emit QR to frontend via socket.io
client.on('qr', (qr) => {
  latestQr = qr;
  console.log('📲 QR code received');
  qrcode.generate(qr, { small: true });
  if (ioInstance) {
    ioInstance.emit('qr', qr);
  }
});

client.on('ready', () => {
  console.log('✅ WhatsApp is ready');
  if (ioInstance) {
    ioInstance.emit('ready');
  }
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failure:', msg);
});

client.on('disconnected', (reason) => {
  console.warn('⚠️ Disconnected:', reason);
  if (ioInstance) {
    ioInstance.emit('disconnected', reason);
  }
});

client.on('message', async (msg) => {
  console.log('📩 MESSAGE RECEIVED:', msg.body);

  if (msg.from.includes('@g.us')) return; // Skip group messages

  // Basic auto-reply logic
  if (msg.body.toLowerCase().trim() === 'hi') {
    await msg.reply('Hello');
  }

  // Optional: Forward to your order API
  try {
    await axios.post('https://your-api.com/api/new-order', {
      from: msg.from.replace(/\D/g, ''),
      message: msg.body,
    });
    console.log('📤 Forwarded to API');
  } catch (err) {
    console.error('❌ Error posting to API:', err.message);
  }
});

// Initialize WhatsApp
client.initialize();

// Export for use in index.js
function setupWhatsApp(io) {
  ioInstance = io;
}

async function sendMessageToWhatsApp(number, message) {
  const chatId = `${number}@c.us`;
  const sentMsg = await client.sendMessage(chatId, message);
  return { success: true, messageId: sentMsg.id._serialized };
}

module.exports = { setupWhatsApp, sendMessageToWhatsApp };
