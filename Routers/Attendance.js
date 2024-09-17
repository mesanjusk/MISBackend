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

        let userArrayIndex = 0;
        if (Type === 'Out') {
            userArrayIndex = 1; 
        }

        const updateData = {
            Attendance_uuid: uuid(),
            Attendance_Record_ID: newRecordNumber,
            Employee_uuid: user.User_uuid, 
            Status,
            User: []
        };

        const existingRecord = await Attendance.findOne({
            Employee_uuid: user.User_uuid,
            'User.Date': new Date().toISOString().split("T")[0]
        });

        if (existingRecord) {
            await Attendance.updateOne(
                { _id: existingRecord._id, 'User.Date': new Date().toISOString().split("T")[0] },
                { $set: { [`User.${userArrayIndex}`]: {
                    Date: new Date().toISOString().split("T")[0],
                    Time,
                    Type,
                    CreatedAt: new Date()
                }}}
            );
        } else {
            updateData.User[userArrayIndex] = {
                Date: new Date().toISOString().split("T")[0],
                Time,
                Type,
                CreatedAt: new Date()
            };

            const newRecord = new Attendance(updateData);
            await newRecord.save();
        }

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