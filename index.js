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
const { setupWhatsApp, sendMessageToWhatsApp } = require("./services/whatsappService");

const app = express();
const http = require('http');
const socketIO = require('socket.io');

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Connect to MongoDB
connectDB();

// Routes
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

// WebSocket server setup
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*', // Allow cross-origin requests
    methods: ['GET', 'POST'],
  },
});

// Initialize WhatsApp functionality with WebSocket
setupWhatsApp(io);

// API route to send WhatsApp messages
app.post('/send-message', async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) return res.status(400).json({ error: 'Missing number or message' });

  try {
    const response = await sendMessageToWhatsApp(number, message);
    return res.status(200).json(response);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
project-root/
│
├── index.js
├── mongo.js
├── services/
│   └── whatsappService.js
├── Routers/
│   ├── Users.js
│   ├── Customer.js
│   └── ... other routers
├── package.json

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
