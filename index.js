const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");
const mongoose = require("mongoose");
const qrcode = require("qrcode");

const connectDB = require("./mongo");
const Message = require('./Models/Message');

const {
  setupWhatsApp,
  getLatestQR,
  isWhatsAppReady,
  sendMessageToWhatsApp
} = require("./Services/whatsappService");

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
const CallLogs = require("./Routers/CallLogs");
const ChatRoutes = require("./Routers/chat"); // ✅ NEW CHAT ROUTES

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: ['https://sbsgondia.vercel.app', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Middleware
const allowedOrigins = ['https://sbsgondia.vercel.app', 'http://localhost:5173'];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// MongoDB connection and WhatsApp init
(async () => {
  try {
    await connectDB();
    setupWhatsApp(io);
  } catch (err) {
    console.error('❌ Failed to initialize:', err);
  }
})();

// API Routes
app.use("/customer", Customers);
app.use("/customergroup", Customergroup);
app.use("/user", Users);
app.use("/usergroup", Usergroup);
app.use("/item", Items);
app.use("/itemgroup", Itemgroup);
app.use("/task", Tasks);
app.use("/taskgroup", Taskgroup);
app.use("/priority", Priority);
app.use("/order", Orders);
app.use("/enquiry", Enquiry);
app.use("/transaction", Transaction);
app.use("/payment_mode", Payment_mode);
app.use("/attendance", Attendance);
app.use("/vendor", Vendors);
app.use("/note", Note);
app.use("/usertask", Usertasks);
app.use("/calllogs", CallLogs);
app.use(ChatRoutes); // ✅ Enable chatlist + customer-by-number

// QR Route
app.get('/qr', async (req, res) => {
  const qr = getLatestQR();
  if (!qr) {
    return res.status(200).json({
      status: "pending",
      message: "QR code not yet generated. Please wait..."
    });
  }

  try {
    const qrImage = await qrcode.toDataURL(qr);
    res.status(200).json({
      status: "ready",
      qrImage
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      message: "Failed to generate QR code",
      error: err.message
    });
  }
});

app.get('/qr-image', async (req, res) => {
  const qr = getLatestQR();
  if (!qr) return res.send("❌ QR code not yet generated. Try again shortly.");
  const imageUrl = await qrcode.toDataURL(qr);
  res.send(`<h2>Scan WhatsApp QR Code</h2><img src="${imageUrl}" alt="QR Code" />`);
});

// Message History
app.get('/messages/:number', async (req, res) => {
  const number = req.params.number;
  const messages = await Message.find({
    $or: [
      { from: number, to: 'me' },
      { from: 'me', to: number }
    ]
  }).sort({ time: 1 });

  res.json({ success: true, messages });
});

// Send WhatsApp Message
app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message)
    return res.status(400).json({ error: 'Missing number or message' });

  try {
    if (!isWhatsAppReady()) {
      return res.status(400).json({ success: false, error: 'WhatsApp not ready. Scan QR in backend first.' });
    }
    const response = await sendMessageToWhatsApp(number, message);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// WhatsApp Status
app.get('/whatsapp-status', (req, res) => {
  res.json({ status: isWhatsAppReady() ? 'connected' : 'disconnected' });
});

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
