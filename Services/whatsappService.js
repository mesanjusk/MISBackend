// Services/whatsappService.js

const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const SessionModel = require('../Models/WhatsAppSession'); // you'll create this model

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

  client.on('qr', async (qr) => {
    const qrImage = await qrcode.toDataURL(qr);
    io.emit('qr', qrImage);
  });

  client.on('authenticated', async (session) => {
    console.log('✅ Authenticated');
    await SessionModel.deleteMany();
    await SessionModel.create({ session });
    io.emit('authenticated');
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp client is ready');
    io.emit('ready');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failure:', msg);
    io.emit('auth_failure', msg);
  });

  client.on('disconnected', async () => {
    console.log('❌ WhatsApp client disconnected');
    await SessionModel.deleteMany();
    io.emit('disconnected');
  });

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
