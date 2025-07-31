const express = require("express");
const router = express.Router();
const Attendance = require("../Models/attendance");
const { v4: uuid } = require("uuid");
const User = require("../Models/users");

// Add attendance entry (keeps the existing functionality)
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
      return res.json({ success: true, message: "New entry added to today's attendance." });
    }

    const lastAttendanceRecord = await Attendance.findOne().sort({ Attendance_Record_ID: -1 });
    const newAttendanceRecordId = lastAttendanceRecord ? lastAttendanceRecord.Attendance_Record_ID + 1 : 1;

    const newAttendance = new Attendance({
      Attendance_uuid: uuid(),
      Attendance_Record_ID: newAttendanceRecordId,
      Employee_uuid: user.User_uuid,
      Date: currentDate,
      Status,
      User: [{ Type, Time, CreatedAt: new Date().toISOString() }]
    });

    await newAttendance.save();
    res.json({ success: true, message: "New attendance recorded successfully." });

  } catch (error) {
    console.error("Error saving attendance:", error);
    res.status(500).json({ success: false, message: "Error saving attendance: " + error.message });
  }
});

// Get all attendance records
router.get("/GetAttendanceList", async (req, res) => {
  try {
    const data = await Attendance.find({}).lean();
    if (data.length > 0) {
      res.json({ success: true, result: data });
    } else {
      res.json({ success: false, message: "Details not found" });
    }
  } catch (err) {
    console.error("Error fetching attendance:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get last 'In' time for the user (to display attendance state)
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

    res.json({ success: true, lastIn });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get today's attendance for a user (to fetch the last attendance status)
router.get('/getTodayAttendance/:userName', async (req, res) => {
  try {
    const { userName } = req.params;
    const user = await User.findOne({ User_name: userName });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    const currentDate = new Date().toISOString().split("T")[0]; // ✅ Fix here

    const todayAttendance = await Attendance.findOne({
      Employee_uuid: user.User_uuid,
      Date: currentDate
    });

    if (!todayAttendance || !Array.isArray(todayAttendance.User)) {
      return res.json({ success: true, flow: [] });
    }

    const sortedEntries = todayAttendance.User.sort((a, b) => new Date(a.CreatedAt) - new Date(b.CreatedAt));
    const flow = sortedEntries.map(entry => entry.Type);

    res.json({ success: true, flow });

  } catch (error) {
    console.error("Error fetching today's attendance:", error);
    res.status(500).json({ success: false, message: "Internal Server Error" });
  }
});


// NEW: Set attendance state for the user (to allow persistence across devices)
router.post('/setAttendanceState', async (req, res) => {
  const { User_name, State } = req.body;

  if (!User_name || !State) {
    return res.status(400).json({ success: false, message: 'All fields are required' });
  }

  try {
    const user = await User.findOne({ User_name });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found." });
    }

    // Retrieve today's attendance record or create a new one
    const currentDate = new Date().toISOString().split('T')[0];
    let todayAttendance = await Attendance.findOne({
      Employee_uuid: user.User_uuid,
      Date: currentDate
    });

    if (!todayAttendance) {
      todayAttendance = new Attendance({
        Attendance_uuid: uuid(),
        Employee_uuid: user.User_uuid,
        Date: currentDate,
        Status: "Active", // Assuming Active status, can be updated as required
        User: []
      });
    }

    // Update attendance state ("In" or "Out")
    todayAttendance.Status = State;

    // Save the attendance record
    await todayAttendance.save();

    res.json({ success: true, message: `Attendance marked as ${State}` });

  } catch (error) {
    console.error("Error setting attendance state:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
