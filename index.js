const express = require("express");
const cors = require("cors");
const connectDB = require("./mongo");

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

const { setupWhatsApp, sendMessageToWhatsApp, getLatestQR, isWhatsAppReady } = require('./Services/whatsappService');
const qrcode = require('qrcode');

const app = express();
const http = require('http');
const socketIO = require('socket.io');

// Define CORS options
const allowedOrigins = ['https://sbsgondia.vercel.app', 'http://localhost:5173'];

const corsOptions = {
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
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Connect to MongoDB
connectDB();

// API routes
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

// WebSocket setup
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize WhatsApp
setupWhatsApp(io);

// QR route
app.get('/qr', async (req, res) => {
  const qr = getLatestQR();
  if (!qr) return res.status(404).send("QR code not yet generated");
  const qrImage = await qrcode.toDataURL(qr);
  res.send(`<img src="${qrImage}" alt="QR Code" />`);
});

// WhatsApp send message API
app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ error: 'Missing number or message' });

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

// Start server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
