const { Client, LocalAuth } = require('whatsapp-web.js');
const axios = require('axios');

let latestQr = null;
let client;

function setupWhatsApp(io) {
  client = new Client({
    authStrategy: new LocalAuth({ clientId: "main-client" }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', qr => {
    latestQr = qr;
    console.log('📲 New QR code generated');
    io.emit('qr', qr); // emit QR to frontend via socket
  });

  client.on('ready', () => {
    console.log('✅ Client is ready');
    io.emit('ready');
  });

  client.on('authenticated', () => {
    console.log('🔐 Authenticated');
    io.emit('authenticated');
  });

  client.on('auth_failure', msg => {
    console.error('❌ Auth failed:', msg);
    io.emit('auth_failure');
  });

  client.on('disconnected', reason => {
    console.warn('⚠️ Disconnected:', reason);
    io.emit('disconnected');
  });

  client.on('message', async msg => {
    console.log('📩 MESSAGE RECEIVED:', msg.body);
    if (msg.from.includes('@g.us')) return; // skip groups

    // auto reply example
    if (msg.body.toLowerCase().includes('hi')) {
      await msg.reply('Hello! 👋');
    }

    try {
      await axios.post('https://your-api.com/api/new-order', {
        from: msg.from.replace(/\D/g, ''),
        message: msg.body
      });
      console.log('📤 Message forwarded to API');
    } catch (err) {
      console.error('❌ Failed to send to API:', err.message);
    }
  });

  client.initialize();
}

function getLatestQR() {
  return latestQr;
}

async function sendMessageToWhatsApp(number, message) {
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const sentMsg = await client.sendMessage(chatId, message);
  return { success: true, id: sentMsg.id._serialized };
}

module.exports = {
  setupWhatsApp,
  sendMessageToWhatsApp,
  getLatestQR
};
