const express = require("express");
const cors = require("cors");
const http = require("http");
const socketIO = require("socket.io");
const connectDB = require("./mongo");

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
const ChatRoutes = require("./Routers/chat");
const {
  setupWhatsApp,
  getQR,
  getReadyStatus,
  sendTestMessage,
} = require("./Services/whatsappService");


const { initScheduler } = require("./Services/messageScheduler");

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: ['https://sbsgondia.vercel.app', 'http://localhost:5173'],
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// CORS Setup
const allowedOrigins = [
  'https://sbsgondia.vercel.app',
  'http://localhost:5173',
  'https://dash.sanjusk.in',
];

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

// MongoDB + WhatsApp Initialization
(async () => {
  try {
    await connectDB();
    initScheduler();
    await setupWhatsApp(io); // ✅ Required to initialize WhatsApp client

   app.get("/whatsapp/qr", (req, res) => {
  const qr = getQR();
  console.log("🧪 Serving /whatsapp/qr - latestQR exists?", !!qr);

  if (!qr) {
    return res.status(200).send(`
      <html>
        <body>
          <h3>QR not ready. Auto-reloading...</h3>
          <script>setTimeout(() => window.location.reload(), 3000);</script>
        </body>
      </html>
    `);
  }

  res.status(200).send(`
    <html>
      <body>
        <h3>Scan WhatsApp QR:</h3>
        <img src="${qr}" width="300" />
      </body>
    </html>
  `);
});


    app.get("/whatsapp/status", (req, res) => {
      res.json({ ready: getReadyStatus() });
    });

    app.post("/whatsapp/send-test", async (req, res) => {
      const { number, message } = req.body;
      try {
        const result = await sendTestMessage(number, message);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

  } catch (err) {
    console.error("❌ Failed to initialize services:", err);
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
app.use(ChatRoutes);

// Start Server
const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`✅ Server is running on port ${PORT}`);
});
