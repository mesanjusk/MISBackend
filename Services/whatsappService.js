const { Client, RemoteAuth } = require('whatsapp-web.js');
const { MongoStore } = require('wwebjs-mongo');
const mongoose = require('mongoose');
const QRCode = require('qrcode');

// Set up the MongoDB session store
const store = new MongoStore({ mongoose: mongoose });

// Initialize WhatsApp client with RemoteAuth
const client = new Client({
  authStrategy: new RemoteAuth({
    store,
    backupSyncIntervalMs: 300000, // Sync every 5 minutes
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox'],
  },
});

// Function to initialize WebSocket and handle WhatsApp events
function setupWhatsApp(io) {
  io.on('connection', (socket) => {
    console.log('✅ Client connected');

    // Emit QR code when received from WhatsApp client
    client.on('qr', async (qr) => {
      console.log('📲 QR Code Received');
      const qrImage = await QRCode.toDataURL(qr); // Generate the QR code image
      socket.emit('qr', qrImage); // Emit QR image to frontend
    });

    // Emit when the client is ready
    client.on('ready', () => {
      console.log('🟢 Client is ready');
      socket.emit('ready', 'WhatsApp is connected');
    });

    // Emit authentication success
    client.on('authenticated', () => {
      console.log('🔒 Authenticated');
      socket.emit('authenticated', 'WhatsApp is authenticated');
    });

    // Emit authentication failure
    client.on('auth_failure', (msg) => {
      console.error('❌ Authentication failure:', msg);
      socket.emit('auth_failure', msg);
    });

    // Emit when the client gets disconnected
    client.on('disconnected', (reason) => {
      console.warn('⚠️ Client was logged out:', reason);
      socket.emit('disconnected', reason);
    });

    // Handle logout request from client
    socket.on('logout', async () => {
      try {
        await client.logout();
        socket.emit('logged_out', 'You have been logged out');
      } catch (err) {
        console.error('Logout error:', err);
        socket.emit('logout_error', err.message);
      }
    });
  });

  // Start WhatsApp client
  client.initialize();
}

// API to send WhatsApp messages (optional, depending on your use case)
async function sendMessageToWhatsApp(number, message) {
  if (!number || !message) throw new Error('Missing number or message');
  
  const chatId = number.includes('@c.us') ? number : `${number}@c.us`;
  try {
    const sent = await client.sendMessage(chatId, message);
    return { success: true, messageId: sent.id._serialized };
  } catch (error) {
    throw new Error(error.message);
  }
}

module.exports = { setupWhatsApp, sendMessageToWhatsApp };

