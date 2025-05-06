<<<<<<< HEAD
// Services/whatsappService.js

const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const SessionModel = require('../Models/WhatsAppSession'); // you'll create this model

let client;

async function setupWhatsApp(io) {
  const sessionData = await SessionModel.findOne();

  client = new Client({
    session: sessionData?.session,
=======
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

let client; // Global client instance
let isClientReady = false; // Track if the client is ready

// Initialize WhatsApp client and Socket.io
function setupWhatsApp(io) {
  client = new Client({
    authStrategy: new LocalAuth(),
>>>>>>> f94d9134d2adcf07461ae1a8ebe03ded8c91ad09
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

<<<<<<< HEAD
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
=======
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
    isClientReady = true; // Set client as ready
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
    isClientReady = false; // Reset client readiness flag
    io.emit('disconnected', reason);
>>>>>>> f94d9134d2adcf07461ae1a8ebe03ded8c91ad09
  });

  client.initialize();
}

<<<<<<< HEAD
function sendMessageToWhatsApp(number, message) {
  if (!client) {
    throw new Error('WhatsApp client not initialized');
  }
  const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;
  return client.sendMessage(formattedNumber, message);
=======
// Send message function
async function sendMessageToWhatsApp(number, message) {
  if (!isClientReady) {
    throw new Error('WhatsApp client is not ready. Please try again later.');
  }

  const formattedNumber = number.includes('@c.us') ? number : `${number}@c.us`;

  try {
    // Send the message to the specified number
    await client.sendMessage(formattedNumber, message);
    return { success: true, message: 'Message sent successfully' };
  } catch (err) {
    console.error('Send Error:', err);
    throw new Error('Failed to send message. Please try again later.');
  }
>>>>>>> f94d9134d2adcf07461ae1a8ebe03ded8c91ad09
}

module.exports = {
  setupWhatsApp,
  sendMessageToWhatsApp,
};
