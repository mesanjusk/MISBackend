const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const SessionModel = require('../Models/WhatsAppSession');

let client;

async function setupWhatsApp(io) {
  const sessionData = await SessionModel.findOne();

  client = new Client({
    session: sessionData?.session,
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  // Emit the QR code to frontend for scanning
  client.on('qr', async (qr) => {
    const qrImage = await qrcode.toDataURL(qr);
    io.emit('qr', qrImage);  // Emit the QR code to frontend
    io.emit('status', 'Waiting for WhatsApp...');
  });

  // Emit event when authenticated
  client.on('authenticated', async (session) => {
    console.log('✅ Authenticated');
    await SessionModel.deleteMany();
    await SessionModel.create({ session });
    io.emit('authenticated');
    io.emit('status', 'WhatsApp authenticated!');
  });

  // Emit event when ready
  client.on('ready', () => {
    console.log('✅ WhatsApp client is ready');
    io.emit('ready');
    io.emit('status', 'WhatsApp Client is ready!');
  });

  // Emit event for authentication failure
  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failure:', msg);
    io.emit('auth_failure', msg);
    io.emit('status', 'Authentication failed');
  });

  // Emit event for disconnected client
  client.on('disconnected', async () => {
    console.log('❌ WhatsApp client disconnected');
    await SessionModel.deleteMany();
    io.emit('disconnected');
    io.emit('status', 'Disconnected from WhatsApp');
  });

  // Initialize the WhatsApp client
  client.initialize();
}

function sendMessageToWhatsApp(number, message) {
  if (!client) {
    throw new Error('WhatsApp client not initialized');
  }
  const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;
  return client.sendMessage(formattedNumber, message);
}

module.exports = {
  setupWhatsApp,
  sendMessageToWhatsApp,
};
