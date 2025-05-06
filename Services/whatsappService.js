const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const io = require('socket.io')(); // Initialize socket.io
const SessionModel = require('./models/session'); // MongoDB model for session storage

// Create a new client instance
const client = new Client({
  puppeteer: {
    headless: true, // Ensure it's set to true for server-side
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// When the QR code is generated
client.on('qr', async (qr) => {
  const qrImage = await qrcode.toDataURL(qr); // Generate the QR code as a data URL
  io.emit('qr', qrImage); // Emit the QR code to the frontend
  io.emit('connectionStatus', 'Scan the QR code with your WhatsApp');
});

// When the client is authenticated
client.on('authenticated', async (session) => {
  console.log('✅ Authenticated');
  await SessionModel.deleteMany(); // Clear previous sessions
  await SessionModel.create({ session }); // Store the new session in MongoDB
  io.emit('authenticated');
  io.emit('connectionStatus', 'Authenticated');
});

// When the client is ready (connected)
client.on('ready', () => {
  console.log('✅ WhatsApp client is ready');
  io.emit('ready');
  io.emit('connectionStatus', 'Connected');
});

// When there's an error
client.on('auth_failure', (message) => {
  console.error('❌ Auth failure', message);
  io.emit('connectionStatus', 'Authentication Failed');
});

// When the client is disconnected
client.on('disconnected', (reason) => {
  console.log('❌ Disconnected', reason);
  io.emit('connectionStatus', 'Disconnected');
});

// Initialize WhatsApp client
client.initialize();

module.exports = { client, io };
