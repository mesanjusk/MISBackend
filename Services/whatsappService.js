const { Client } = require('whatsapp-web.js');
const axios = require('axios');
const fs = require('fs');

let latestQr = null;
let client;

function setupWhatsApp(io) {
  const SESSION_FILE_PATH = './session.json';
  let sessionData;

  if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = require(SESSION_FILE_PATH);
  }

  client = new Client({
    session: sessionData,
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', qr => {
    latestQr = qr;
    console.log('📲 New QR code generated');
  });

  client.on('authenticated', (session) => {
    fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(session));
    console.log('✅ Authenticated');
  });

  client.on('ready', () => {
    console.log('✅ Client is ready');
  });

  client.on('message', async msg => {
    console.log('📩 MESSAGE RECEIVED:', msg.body);
    if (msg.from.includes('@g.us')) return;

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

async function sendMessageToWhatsApp(number, message) {
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  const sentMsg = await client.sendMessage(chatId, message);
  return { success: true, id: sentMsg.id._serialized };
}

module.exports = {
  setupWhatsApp,
  sendMessageToWhatsApp
};
