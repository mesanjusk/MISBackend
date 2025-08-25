const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");
const connectDB = require("./mongo");
require("dotenv").config();
const compression = require("compression");

// Handle any unhandled promise rejections to avoid crashing the 
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// Routers
const Users = require("./Routers/Users");
const Usergroup = require("./Routers/Usergroup");
const Customers = require("./Routers/Customer");
const Customergroup = require("./Routers/Customergroup");
const Tasks = require("./Routers/Task");
const Taskgroup = require("./Routers/Taskgroup");
const Items = require("./Routers/Items");
const Itemgroup = require("./Routers/Itemgroup");
const Priority = require("./Routers/Priority");
const Orders = require("./Routers/Order");
const Enquiry = require("./Routers/Enquiry");
const Payment_mode = require("./Routers/Payment_mode");
const Transaction = require("./Routers/Transaction");
const Attendance = require("./Routers/Attendance");
const Vendors = require("./Routers/Vendor");
const Note = require("./Routers/Note");
const Usertasks = require("./Routers/Usertask");
const OrderMigrate = require("./Routers/OrderMigrate");
const paymentFollowupRouter = require("./Routers/paymentFollowup");
const Dashboard = require("./Routers/Dashboard"); // NEW

// WhatsApp Services
const {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
} = require("./Services/whatsappService");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

// ---------- Core middleware ----------
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(compression()); // enable before routes

// ---------- Health check ----------
app.get("/", (_req, res) => res.json({ ok: true, service: "MIS Backend" }));

// ---------- API namespace ----------
app.use("/api/users", Users);
app.use("/api/usergroup", Usergroup);
app.use("/api/customers", Customers);
app.use("/api/customergroup", Customergroup);
app.use("/api/tasks", Tasks);
app.use("/api/taskgroup", Taskgroup);
app.use("/api/items", Items);
app.use("/api/itemgroup", Itemgroup);
app.use("/api/priority", Priority);
app.use("/api/orders", Orders);
app.use("/api/enquiry", Enquiry);
app.use("/api/payment_mode", Payment_mode);
app.use("/api/transaction", Transaction);
app.use("/api/attendance", Attendance);
app.use("/api/vendors", Vendors);
app.use("/api/note", Note);
app.use("/api/usertasks", Usertasks);
app.use("/api/orders-migrate", OrderMigrate); // distinct path (no overlap)
app.use("/api/paymentfollowup", paymentFollowupRouter);
app.use("/api/dashboard", Dashboard); // NEW

// ---------- Legacy paths (optional) ----------
app.use("/user", Users);
app.use("/usergroup", Usergroup);
app.use("/customer", Customers);
app.use("/customergroup", Customergroup);
app.use("/tasks", Tasks);
app.use("/taskgroup", Taskgroup);
app.use("/items", Items);
app.use("/item", Items);
app.use("/itemgroup", Itemgroup);
app.use("/priority", Priority);
app.use("/order", Orders);
app.use("/enquiry", Enquiry);
app.use("/payment_mode", Payment_mode);
app.use("/transaction", Transaction);
app.use("/attendance", Attendance);
app.use("/vendors", Vendors);
app.use("/note", Note);
app.use("/usertasks", Usertasks);
app.use("/usertask", Usertasks);
app.use("/paymentfollowup", paymentFollowupRouter);
app.use("/dashboard", Dashboard); // legacy without /api

// ---------- WhatsApp ----------
app.get("/whatsapp/qr", (req, res) => {
  const qr = getLatestQR();
  if (qr) res.status(200).json({ qr });
  else res.status(404).json({ message: "QR not ready" });
});

app.get("/qr", (req, res) => {
  const qr = getLatestQR();
  if (!qr) return res.send("QR not ready");
  res.send(`
    <html><body>
      <h2>Scan QR to Login WhatsApp</h2>
      <img src="${qr}" style="width:300px;" />
    </body></html>
  `);
});

app.get("/whatsapp/status", (req, res) => {
  res.json({ ready: isWhatsAppReady() });
});

app.post("/whatsapp/send-test", async (req, res) => {
  const { number, message, mediaUrl } = req.body;
  try {
    const result = await sendMessageToWhatsApp(number, message, mediaUrl);
    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Failed to send message:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Init DB + WhatsApp ----------
(async () => {
  await connectDB();
  try {
    await setupWhatsApp(io, process.env.SESSION_ID || "admin");
  } catch (err) {
    console.error("❌ Failed to initialize WhatsApp client:", err);
  }
})();

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
