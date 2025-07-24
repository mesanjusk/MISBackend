const ScheduledMessage = require('../Models/ScheduledMessage');
const { sendMessageToWhatsApp, isWhatsAppReady } = require('./whatsappService');

async function processScheduledMessages() {
  const now = new Date();
  const messages = await ScheduledMessage.find({ sendAt: { $lte: now }, status: 'scheduled' });

  for (const msg of messages) {
    try {
      if (isWhatsAppReady(msg.sessionId)) {
        await sendMessageToWhatsApp(msg.to, msg.message, msg.sessionId);
        msg.status = 'sent';
      } else {
        continue;
      }
    } catch (err) {
      console.error('Failed to send scheduled message', err);
      msg.status = 'failed';
    }
    await msg.save();
  }
}

function initScheduler() {
  // Run every 5 seconds
  setInterval(processScheduledMessages, 5000);
}

async function scheduleMessage(sessionId, to, message, sendAt) {
  return ScheduledMessage.create({ sessionId, to, message, sendAt });
}

module.exports = { initScheduler, scheduleMessage };
