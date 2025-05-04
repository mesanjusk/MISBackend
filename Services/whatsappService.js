const { Client, LocalAuth } = require('whatsapp-web.js');
const qrCodeToImage = require('qrcode'); // For Base64 QR image generation

function setupWhatsApp(io) {
  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  // Listen for the QR code event
  client.on('qr', (qr) => {
    console.log('QR RECEIVED:', qr);

    // Convert the QR code to a base64 PNG image
    qrCodeToImage.toDataURL(qr, (err, url) => {
      if (err) {
        console.error('Error generating QR image:', err);
      } else {
        // Emit the base64 image URL to the frontend
        io.emit('qr', url);
      }
    });
  });

  // When the WhatsApp client is ready
  client.on('ready', () => {
    console.log('WhatsApp Client is ready!');
    io.emit('ready', 'WhatsApp Client is ready!');
  });

  // When the WhatsApp client is authenticated
  client.on('authenticated', () => {
    console.log('WhatsApp Authenticated');
    io.emit('authenticated', 'WhatsApp Authenticated');
  });

  // Listen for incoming messages (optional)
  client.on('message', async (message) => {
    console.log('Message received:', message.body);
    // You can add auto-reply or processing logic here if needed
  });

  // Initialize the WhatsApp client
  client.initialize();
}

module.exports = { setupWhatsApp };
