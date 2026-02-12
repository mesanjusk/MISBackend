require("dotenv").config(); 
const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");
const connectDB = require("./config/mongo");
const compression = require("compression");
const AppError = require("./utils/AppError");
const asyncHandler = require("./utils/asyncHandler");
const { errorHandler, notFound } = require("./middleware/errorHandler");

// Handle any unhandled promise rejections to avoid crashing the appsss
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

// Routers
const Users = require("./routes/Users");
const Usergroup = require("./routes/Usergroup");
const Customers = require("./routes/Customer");
const Customergroup = require("./routes/Customergroup");
const Tasks = require("./routes/Task");
const Taskgroup = require("./routes/Taskgroup");
const Items = require("./routes/Items");
const Itemgroup = require("./routes/Itemgroup");
const Priority = require("./routes/Priority");
const Orders = require("./routes/Order");
const Enquiry = require("./routes/Enquiry");
const Payment_mode = require("./routes/Payment_mode");
const Transaction = require("./routes/Transaction");
const OldTransaction = require("./routes/OldTransaction");
const Attendance = require("./routes/Attendance");
const Vendors = require("./routes/Vendor");
const Note = require("./routes/Note");
const Usertasks = require("./routes/Usertask");
const OrderMigrate = require("./routes/OrderMigrate");
const paymentFollowupRouter = require("./routes/paymentFollowup");
const Dashboard = require("./routes/Dashboard");
const WhatsAppCloud = require("./routes/WhatsAppCloud");

// WhatsApp Services
const {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp,
} = require("./services/whatsappService");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: "*" } });

// ---------- Core middleware ----------
app.use(cors());
app.use(express.json({
  limit: "50mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(compression());

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
app.use("/api/old-transaction", OldTransaction);
app.use("/api/attendance", Attendance);
app.use("/api/vendors", Vendors);
app.use("/api/note", Note);
app.use("/api/usertasks", Usertasks);
app.use("/api/orders-migrate", OrderMigrate);
app.use("/api/paymentfollowup", paymentFollowupRouter);
app.use("/api/dashboard", Dashboard);
app.use("/api/whatsapp", WhatsAppCloud);

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
app.use("/old-transaction", OldTransaction);
app.use("/attendance", Attendance);
app.use("/vendors", Vendors);
app.use("/note", Note);
app.use("/usertasks", Usertasks);
app.use("/usertask", Usertasks);
app.use("/paymentfollowup", paymentFollowupRouter);
app.use("/dashboard", Dashboard);

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

app.get("/whatsapp/status", (_req, res) => {
  res.json({ ready: isWhatsAppReady() });
});

app.post(
  "/whatsapp/send-test",
  asyncHandler(async (req, res) => {
    const { number, message, mediaUrl } = req.body || {};

    if (!number || !message) {
      throw new AppError("'number' and 'message' are required", 400);
    }

    const result = await sendMessageToWhatsApp(number, message, mediaUrl);
    res.status(200).json(result);
  })
);

// ---------- Init DB + WhatsApp ----------
(async () => {
  await connectDB();
  try {
    await setupWhatsApp(io, process.env.SESSION_ID || "admin");
  } catch (err) {
    console.error("❌ Failed to initialize WhatsApp client:", err);
  }
})();

// ---------- Error handling ----------
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
