const express = require("express");
const router = express.Router();
const Attendance = require("../Models/attendance");
const { v4: uuid } = require("uuid");
const User = require("../Models/users")

router.post("/addAttendance", async (req, res) => {
    const {
        User_name, 
        Type,
        Status,
        Time
    } = req.body;

    if (!User_name || !Type || !Status || !Time) {
        return res.status(400).json({
            success: false,
            message: "User_name, Type, Status, and Time are required fields."
        });
    }

    try {
        const user = await User.findOne({ User_name });
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const lastRecord = await Attendance.findOne().sort({ Attendance_Record_ID: -1 });
        const newRecordNumber = lastRecord ? lastRecord.Attendance_Record_ID + 1 : 1;

        const newRecord = new Attendance({
            Attendance_uuid: uuid(),
            Attendance_Record_ID: newRecordNumber,
            Employee_uuid: user.User_uuid, 
            Status,
            User: [{
                Date: new Date().toISOString().split("T")[0],
                Time: new Date().toLocaleTimeString('en-US', { hour12: false }),
                Type,
                CreatedAt: new Date() 
            }]
        });

        await newRecord.save();
        res.json({ success: true, message: "Attendance added successfully" });
    } catch (error) {
        console.error("Error saving attendance:", error);
        res.status(500).json({ success: false, message: "Failed to add attendance" });
    }
});


  router.get("/GetAttendanceList", async (req, res) => {
    try {
      let data = await Attendance.find({});
  
      if (data.length)
        res.json({ success: true, result: data.filter((a) => a.Employee_uuid) });
      else res.json({ success: false, message: "Details Not found" });
    } catch (err) {
      console.error("Error fetching users:", err);
        res.status(500).json({ success: false, message: err });
    }
  });

 

  module.exports = router;