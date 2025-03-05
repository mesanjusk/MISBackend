const express = require("express");
const router = express.Router();
const Attendance = require("../Models/attendance");
const { v4: uuid } = require("uuid");
const User = require("../Models/users");

router.post('/addAttendance', async (req, res) => {
    const { User_name, Type, Status, Time } = req.body;
    if (!User_name || !Type || !Status || !Time) {
        return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const currentDate = new Date().toISOString().split('T')[0];

    try {
        const user = await User.findOne({ User_name });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        let todayAttendance = await Attendance.findOne({
            Employee_uuid: user.User_uuid,
            Date: currentDate
        });

        if (todayAttendance) {
            todayAttendance.User.push({ Type, Time, CreatedAt: new Date().toISOString() });
            await todayAttendance.save();
            return res.json({ success: true, message: 'New entry added to today\'s attendance.' });
        }

        const lastAttendanceRecord = await Attendance.findOne({})
            .sort({ Attendance_Record_ID: -1 });

        let newAttendanceRecordId = lastAttendanceRecord ? lastAttendanceRecord.Attendance_Record_ID + 1 : 1;

        const newAttendance = new Attendance({
            Attendance_uuid: uuid(),
            Attendance_Record_ID: newAttendanceRecordId, 
            Employee_uuid: user.User_uuid,
            Date: currentDate,
            Status: Status,
            User: [{ Type, Time, CreatedAt: new Date().toISOString() }]
        });

        await newAttendance.save();
        return res.json({ success: true, message: 'New attendance recorded successfully.' });

    } catch (error) {
        console.error('Error saving attendance:', error);
        res.status(500).json({ success: false, message: 'Error saving attendance: ' + error.message });
    }
});

router.get("/GetAttendanceList", async (req, res) => {
    try {
        let data = await Attendance.find({}).populate('User');  

        if (data.length)
            res.json({ success: true, result: data });
        else
            res.json({ success: false, message: "Details Not found" });
    } catch (err) {
        console.error("Error fetching attendance:", err);
        res.status(500).json({ success: false, message: err });
    }
});

router.get('/getLastIn/:userName', async (req, res) => {
    try {
        const { userName } = req.params;
        const user = await User.findOne({ User_name: userName });

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        const lastInRecord = await Attendance.findOne({
            Employee_uuid: user.User_uuid,
            "User.Type": "In"
        })
        .sort({ "User.Time": -1 })
        .select("User");

        if (!lastInRecord || lastInRecord.User.length === 0) {
            return res.status(404).json({ success: false, message: "No 'In' record found" });
        }
        const lastIn = lastInRecord.User.filter(entry => entry.Type === "In").pop();

        res.json(lastIn);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

 

  module.exports = router;