const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const qrCodeToImage = require('qrcode'); // To generate a base64 QR image.

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

    // Convert the QR code to a base64 PNG image
    qrCodeToImage.toDataURL(qr, (err, url) => {
      if (err) {
        console.error('Error generating QR image:', err);
      } else {
        io.emit('qr', url); // Emit the base64 image to the frontend
      }
    });
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
