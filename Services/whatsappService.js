// services/whatsappService.js
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

function setupWhatsApp(io) {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('QR RECEIVED', qr);
    qrcode.generate(qr, { small: true });
    io.emit('qr', qr);
  });

  client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    io.emit('ready', 'WhatsApp Client is ready!');
  });

  client.on('authenticated', () => {
    console.log('WhatsApp Authenticated');
    io.emit('authenticated', 'WhatsApp Authenticated');
  });

  client.on('message', async (message) => {
    console.log('Message received:', message.body);
    // Add auto-reply or processing logic if needed
  });

  client.initialize();
}

module.exports = { setupWhatsApp };
