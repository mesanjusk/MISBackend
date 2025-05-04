// services/whatsappService.js
const { Client, Buttons, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
  console.log('QR RECEIVED', qr);
});

client.on('ready', () => {
  console.log('WhatsApp client is ready!');
});

client.on('message', async msg => {
  const messageText = msg.body.toLowerCase();

  if (messageText === 'hi' || messageText === 'hello') {
    const button = new Buttons('Welcome! What would you like to do?', [
      { body: 'Order Status' },
      { body: 'Talk to Support' },
    ]);
    await client.sendMessage(msg.from, button);
  } else if (messageText === 'order status') {
    await client.sendMessage(msg.from, 'Your order is being processed.');
  } else if (messageText === 'talk to support') {
    await client.sendMessage(msg.from, 'Our support team will contact you shortly.');
  }
});

client.initialize();

module.exports = { client };
