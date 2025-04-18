const express = require("express")
const cors = require("cors")
const connectDB = require("./mongo")
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
const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cors());

connectDB();

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
app.use("/calllogs", CallLogs)

app.listen(8000,()=>{
    console.log("port connected");
})