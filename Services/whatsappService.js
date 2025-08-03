const { Client, RemoteAuth } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const mongoose = require("mongoose");
const qrcode = require("qrcode");
const Message = require("../Models/Message");

let client;
let latestQR = null;
let isReady = false;

async function setupWhatsApp(io, sessionId = "default") {
  if (client) return;

  await mongoose.connection.asPromise();
  const store = new MongoStore({ mongoose });

  client = new Client({
    authStrategy: new RemoteAuth({
      store,
      clientId: sessionId,
      backupSyncIntervalMs: 300000,
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", async (qr) => {
    console.log("📸 QR received!");
    try {
      const imageUrl = await qrcode.toDataURL(qr);
      latestQR = imageUrl;
      io.emit("qr", imageUrl);
      console.log("✅ QR base64 image stored and emitted");
    } catch (err) {
      console.error("❌ QR Conversion Error:", err);
      latestQR = null;
    }
  });

  client.on("ready", () => {
    isReady = true;
    latestQR = null;
    io.emit("ready");
    console.log("✅ WhatsApp client is ready");
  });

  client.on("authenticated", () => {
    console.log("✅ WhatsApp authenticated");
  });

  client.on("auth_failure", (msg) => {
    console.error("❌ Auth failure:", msg);
    io.emit("auth_failure", msg);
  });

  client.on("message", async (msg) => {
    const from = msg.from.replace("@c.us", "");
    const text = msg.body;
    const time = new Date();

    await Message.create({ from, to: sessionId, text, time });
    io.emit("message", { from, message: text, time });
  });

  client.on("disconnected", () => {
    isReady = false;
    latestQR = null;
    client = null;
    io.emit("disconnected");
    console.log("🔌 WhatsApp client disconnected");
  });

  console.log("⚡ Initializing WhatsApp client...");
  await client.initialize();
  console.log("🚀 WhatsApp client initialized");
}

function getLatestQR() {
  return latestQR;
}

function isWhatsAppReady() {
  return isReady;
}

async function sendMessageToWhatsApp(number, message) {
  if (!client || !isReady) throw new Error("WhatsApp client not ready");

  // Normalize number if only 10 digits
  const normalized = number.length === 10 ? `91${number}` : number;
  const chatId = normalized.includes("@c.us") ? normalized : `${normalized}@c.us`;

  const sent = await client.sendMessage(chatId, message);  // ✅ FIXED here

  await Message.create({
    from: "admin",
    to: number,
    text: message,
    time: new Date(),
  });

  console.log("✅ Sent message object:", sent); // <== ADD THIS LINE

return {
  success: true,
  messageId: sent?.id?._serialized || sent?.id || "sent",  // fallback added
};

}



module.exports = {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
};
