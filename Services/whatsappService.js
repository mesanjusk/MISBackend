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
    io.emit('qr', qr);
    console.log('📲 New QR code generated');
  });

  client.on('ready', () => {
    io.emit('ready');
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

  client.on('auth_failure', msg => {
    io.emit('auth_failure');
    console.error('❌ Auth failed:', msg);
  });

  client.on('disconnected', reason => {
    io.emit('disconnected');
    console.warn('⚠️ Disconnected:', reason);
  });

  io.on('connection', (socket) => {
    console.log('📡 Frontend connected via socket');

    // Emit QR again if already available
    if (latestQr) {
      socket.emit('qr', latestQr);
    }

    socket.on('send-message', async ({ number, message }) => {
      try {
        const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
        await client.sendMessage(chatId, message);
        socket.emit('message-sent', { success: true });
      } catch (err) {
        socket.emit('message-sent', { success: false, error: err.message });
      }
    });

    socket.on('logout', async () => {
      try {
        await client.logout();
        socket.emit('logged-out');
      } catch (err) {
        console.error('Logout failed:', err);
      }
    });
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
