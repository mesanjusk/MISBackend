const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');

let client;

function setupWhatsApp(io) {
  client = new Client({
    authStrategy: new LocalAuth({ clientId: 'client-one' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  client.on('qr', (qr) => {
    qrcode.generate(qr, { small: true });
    console.log('📲 Scan the QR code shown above to connect.');

    // Optional: emit QR to frontend via socket.io
    if (io) {
      io.emit('qr', qr);
    }
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp client is ready.');
    if (io) io.emit('ready');
  });

  client.on('auth_failure', msg => {
    console.error('❌ Authentication failed:', msg);
  });

  client.on('disconnected', reason => {
    console.warn('⚠️ WhatsApp client disconnected:', reason);
    if (io) io.emit('disconnected', reason);
  });

  client.on('message', async msg => {
    console.log(`📩 Message from ${msg.from}: ${msg.body}`);

    // Example auto-response
    if (msg.body.toLowerCase() === 'hi') {
      await msg.reply('Hello 👋');
    }

    // Optional: forward to your API
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

// Optional: for sending outbound messages
async function sendMessageToWhatsApp(number, message) {
  const chatId = `${number}@c.us`;
  await client.sendMessage(chatId, message);
  return { success: true, sentTo: number };
}

module.exports = {
  setupWhatsApp,
  sendMessageToWhatsApp
};
