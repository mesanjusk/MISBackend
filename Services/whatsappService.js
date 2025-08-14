// Services/whatsappService.js
const { Client, RemoteAuth, MessageMedia } = require("whatsapp-web.js");
const { MongoStore } = require("wwebjs-mongo");
const mongoose = require("mongoose");
const qrcode = require("qrcode");
const Message = require("../Models/Message");

let client = null;
let latestQR = null;
let isReady = false;
let isInitializing = false;
let currentSessionId = "default";
let store; // MongoStore instance

// --- Helpers --------------------------------------------------------------

function looksLikeZlibCorruption(err) {
  const msg = err?.message || "";
  return err?.code === "Z_BUF_ERROR" || /unexpected end of file/i.test(msg);
}

// Best-effort session clear for this sessionId (MongoStore API varies by version)
async function clearRemoteSession(sessionId) {
  try {
    // Newer wwebjs-mongo versions support delete({ session: string }) or delete(sessionId)
    if (typeof store?.delete === "function") {
      try {
        await store.delete({ session: sessionId });
      } catch {
        await store.delete(sessionId);
      }
    }

    // Extra safety: some versions separate credentials/keys
    if (store?.clear) {
      await store.clear(sessionId);
    }
  } catch (e) {
    console.warn("⚠️ Could not clear session via store.delete/clear; continuing.", e?.message);
  }

  // Absolute fallback: directly nuke collections by convention (only if needed).
  // Uncomment & adjust if you know your collection names.
  // try {
  //   const db = mongoose.connection.db;
  //   await db.collection("wwebjs.sessions").deleteMany({ session: sessionId });
  //   await db.collection("wwebjs.keys").deleteMany({ session: sessionId });
  // } catch (e) {
  //   console.warn("⚠️ Fallback collection cleanup skipped/failed:", e?.message);
  // }
}

function normalizeIndianNumber(input) {
  // returns something like "9198xxxxxxxx@c.us"
  let n = String(input || "").trim();

  // already a chat id?
  if (/@c\.us$/.test(n)) return n;

  // remove non-digits, keep leading +
  n = n.replace(/[^\d+]/g, "");

  // If it starts with +, strip + for WhatsApp format below
  if (n.startsWith("+")) n = n.slice(1);

  // If starts with 0, assume local and convert to 91XXXXXXXXXX
  if (/^0\d{10}$/.test(n)) n = "91" + n.slice(1);

  // If already starts with 91 and has total 12 digits (e.g., 9198xxxxxxxx)
  if (/^91\d{10}$/.test(n)) return `${n}@c.us`;

  // If 10-digit Indian mobile, prefix 91
  if (/^\d{10}$/.test(n)) return `91${n}@c.us`;

  // Fallback: treat as-is (user may be sending full intl without +)
  return `${n}@c.us`;
}

async function saveInboundMessage(sessionId, from, text) {
  try {
    await Message.create({ from, to: sessionId, text, time: new Date() });
  } catch (e) {
    console.warn("⚠️ Failed to save inbound message:", e?.message);
  }
}

async function saveOutboundMessage(number, text, mediaUrl) {
  try {
    await Message.create({
      from: "admin",
      to: number,
      text: text || (mediaUrl ? "Media sent" : ""),
      media: mediaUrl || null,
      time: new Date(),
    });
  } catch (e) {
    console.warn("⚠️ Failed to save outbound message:", e?.message);
  }
}

// --- Core init / lifecycle -----------------------------------------------

async function bootClient(io, sessionId) {
  if (client || isInitializing) return;
  isInitializing = true;
  currentSessionId = sessionId || "default";

  await mongoose.connection.asPromise();
  store = new MongoStore({ mongoose });

  // Build a fresh RemoteAuth strategy each time we initialize
  const authStrategy = new RemoteAuth({
    store,
    clientId: currentSessionId,
    backupSyncIntervalMs: 300000, // 5 min
  });

  client = new Client({
    authStrategy,
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
      ],
      timeout: 120000, // give chromium enough time on cold boot
    },
  });

  // ---- Event wiring
  client.on("qr", async (qr) => {
    console.log("📸 QR received!");
    try {
      latestQR = await qrcode.toDataURL(qr);
      io.emit("qr", latestQR);
      console.log("✅ QR base64 image stored and emitted");
    } catch (err) {
      console.error("❌ QR conversion error:", err);
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

  client.on("auth_failure", async (msg) => {
    console.error("❌ Auth failure:", msg);
    io.emit("auth_failure", msg);
    try {
      await clearRemoteSession(currentSessionId);
    } finally {
      // Force a full re-init to get a new QR
      await safeReinitialize(io);
    }
  });

  client.on("message", async (msg) => {
    const from = msg.from.replace("@c.us", "");
    const text = msg.body;
    await saveInboundMessage(currentSessionId, from, text);
    io.emit("message", { from, message: text, time: new Date() });
  });

  client.on("disconnected", async (reason) => {
    console.warn("🔌 WhatsApp client disconnected:", reason);
    isReady = false;
    latestQR = null;
    io.emit("disconnected", reason);
    // Clear session on abnormal disconnects so next init emits QR
    await clearRemoteSession(currentSessionId);
    await safeReinitialize(io);
  });

  console.log("⚡ Initializing WhatsApp client...");
  try {
    await client.initialize();
    console.log("🚀 WhatsApp client initialized");
  } catch (err) {
    console.error("❌ Failed to initialize WhatsApp client:", err);
    if (looksLikeZlibCorruption(err)) {
      console.error("🧹 Detected corrupted auth state. Clearing and re-initializing…");
      await clearRemoteSession(currentSessionId);
      try {
        // Rebuild the client object from scratch
        await destroyClient();
      } catch {}
      client = null;
      isInitializing = false;
      // Re-enter boot flow to trigger a clean QR
      return bootClient(io, currentSessionId);
    } else {
      // Keep flags consistent on any other error
      await destroyClient();
      isInitializing = false;
      throw err;
    }
  } finally {
    isInitializing = false;
  }
}

async function safeReinitialize(io) {
  try {
    await destroyClient();
  } catch {}
  client = null;
  return bootClient(io, currentSessionId);
}

async function destroyClient() {
  try {
    if (client) {
      try {
        // Logout attempts to clear server-side session. Ignore errors if already broken.
        await client.logout();
      } catch {}
      await client.destroy();
    }
  } catch (e) {
    // swallow
  } finally {
    client = null;
    isReady = false;
    latestQR = null;
  }
}

// --- Public API -----------------------------------------------------------

async function setupWhatsApp(io, sessionId = "default") {
  if (client || isInitializing) return;
  await bootClient(io, sessionId);
}

function getLatestQR() {
  return latestQR;
}

function isWhatsAppReady() {
  return isReady;
}

async function sendMessageToWhatsApp(number, message, mediaUrl = "") {
  if (!client || !isReady) throw new Error("WhatsApp client not ready");

  const chatId = normalizeIndianNumber(number);

  console.log("➡️ Sending to:", chatId);
  console.log("➡️ Message:", message);
  console.log("➡️ Media URL:", mediaUrl);

  let sent;
  try {
    if (mediaUrl) {
      try {
        const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
        sent = await client.sendMessage(chatId, media, {
          caption: message || "🧾 Invoice attached",
        });
      } catch (mediaErr) {
        console.warn("⚠️ Failed to send media message. Falling back to text.", mediaErr?.message);
        sent = await client.sendMessage(chatId, message || ""); // text fallback
      }
    } else {
      sent = await client.sendMessage(chatId, message || "");
    }
  } catch (err) {
    // If we get here, client likely lost connection between ready & send
    console.error("❌ Send failed:", err?.message || err);
    throw err;
  }

  await saveOutboundMessage(number, message, mediaUrl);

  return {
    success: true,
    messageId: sent?.id?._serialized || "sent",
  };
}

module.exports = {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
};
