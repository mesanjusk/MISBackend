const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const SessionModel = require('../Models/WhatsAppSession'); // Assuming this model exists

let client;

// Setup WhatsApp Client
async function setupWhatsApp(io) {
  // Retrieve any existing session data from MongoDB
  const sessionData = await SessionModel.findOne();

  // Initialize WhatsApp client with the session if exists
  client = new Client({
    session: sessionData?.session,
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  // Handle QR Code generation event
  client.on('qr', async (qr) => {
    // Convert QR code to data URL
    const qrImage = await qrcode.toDataURL(qr);
    io.emit('qr', qrImage); // Send QR image to frontend

    // Save the QR session to the database
    await saveQrSession(qr);
  });

  // Handle authentication event
  client.on('authenticated', async (session) => {
    console.log('✅ Authenticated');
    // Delete any old session data and save the new session
    await SessionModel.deleteMany();
    await SessionModel.create({ session });

    io.emit('authenticated');
  });

  // Handle client readiness
  client.on('ready', () => {
    console.log('✅ WhatsApp client is ready');
    io.emit('ready');
  });

  // Handle authentication failure
  client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failure:', msg);
    io.emit('auth_failure', msg);
  });

  // Handle client disconnection
  client.on('disconnected', async () => {
    console.log('❌ WhatsApp client disconnected');
    await SessionModel.deleteMany();
    io.emit('disconnected');
  });

  // Initialize the client
  client.initialize();
}

// Save the QR session in the MongoDB database
async function saveQrSession(qr) {
  const existingSession = await SessionModel.findOne();
  if (!existingSession) {
    // Save a new QR session to the database if no session exists
    const session = new SessionModel({
      session: { qr },
      createdAt: new Date(),
    });
    await session.save();
    console.log('QR session saved to MongoDB');
  } else {
    console.log('QR session already exists in the database');
  }
}

// Function to send messages via WhatsApp client
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
