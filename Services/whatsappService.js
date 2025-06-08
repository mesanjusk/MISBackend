const { Client, LocalAuth } = require('whatsapp-web.js');

let latestQr = null;
let client;

function setupWhatsApp(io) {
  client = new Client({
    authStrategy: new LocalAuth({ clientId: "main-client" }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', qr => {
    latestQr = qr;
    console.log('📲 New QR code generated');
    io.emit('qr', qr);
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
    if (msg.from.includes('@g.us')) return; // Skip group messages

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
  if (!client || !client.info || !client.info.wid) {
    throw new Error("WhatsApp client is not ready yet");
  }

  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;

  try {
    const sentMsg = await client.sendMessage(chatId, message);
    return { success: true, id: sentMsg.id._serialized };
  } catch (error) {
    console.error('❌ Failed to send WhatsApp message:', error.message);
    throw error;
  }
}

module.exports = {
  setupWhatsApp,
  sendMessageToWhatsApp,
  getLatestQR,
};
