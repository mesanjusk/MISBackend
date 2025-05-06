const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client; // Global so we can access it later

// Initialize WhatsApp client and Socket.io
function setupWhatsApp(io) {
  client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('QR RECEIVED');
    qrcode.toDataURL(qr, (err, url) => {
      if (!err) {
        io.emit('qr', url); // Send base64 QR image to frontend
      }
    });
  });

  client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    io.emit('ready', 'WhatsApp is ready!');
  });

  client.on('authenticated', () => {
    console.log('WhatsApp authenticated');
    io.emit('authenticated', 'WhatsApp authenticated');
  });

  client.on('auth_failure', (msg) => {
    console.error('AUTHENTICATION FAILURE', msg);
    io.emit('auth_failure', msg);
  });

  client.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    io.emit('disconnected', reason);
  });

  client.initialize();
}

// Send message function
async function sendMessageToWhatsApp(number, message) {
  if (!client || !client.info) {
    throw new Error('WhatsApp client is not ready');
  }

  const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;

  try {
    await client.sendMessage(formattedNumber, message);
    return { success: true, message: 'Message sent successfully' };
  } catch (err) {
    console.error('Send Error:', err);
    throw new Error('Failed to send message');
  }
}

module.exports = {
  setupWhatsApp,
  sendMessageToWhatsApp,
};
