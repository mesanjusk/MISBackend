require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const connectDB = require("./config/mongo");
const compression = require("compression");
const { errorHandler, notFound } = require("./middleware/errorHandler");

// Handle unhandled promise rejections
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

const app = express();
const server = http.createServer(app);

// ---------- Core middleware ----------
app.use(cors());
app.use(express.json({
  limit: "50mb",
  verify: (req, _res, buf) => {
    req.rawBody = buf; // Required for webhook signature verification
  },
}));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));
app.use(compression());

// ---------- Health check ----------
app.get("/", (_req, res) =>
  res.json({ ok: true, service: "MIS Backend - Cloud API" })
);

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

// ✅ WhatsApp Business Cloud API
app.use("/api/whatsapp", WhatsAppCloud);

// ---------- Init DB ----------
(async () => {
  await connectDB();
})();

// ---------- Error handling ----------
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
