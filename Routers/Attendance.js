const express = require("express");
const router = express.Router();
const Attendance = require("../Models/attendance");
const { v4: uuid } = require("uuid");
const User = require("../Models/users")

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

        const attendanceRecord = await Attendance.findOne({ 
            Employee_uuid: user.User_uuid 
        });

        if (attendanceRecord) {
         
            const dateExists = attendanceRecord.User.some(entry => entry.Date === currentDate);

            if (dateExists) {
                
                attendanceRecord.User.push({ Type, Date: currentDate, Time, CreatedAt: new Date().toISOString() });
                await attendanceRecord.save(); 
                return res.json({ success: true, message: 'New entry added to today\'s attendance.' });
            } else {
              
                attendanceRecord.User.push({ Type, Date: currentDate, Time, CreatedAt: new Date().toISOString() });
                await attendanceRecord.save(); 
                return res.json({ success: true, message: 'Attendance recorded successfully for a new date entry.' });
            }
        } else {
          
            const newAttendanceRecordId = await getNextAttendanceRecordId(); 

            const newAttendance = new Attendance({
                Attendance_uuid: uuid(),
                Attendance_Record_ID: newAttendanceRecordId, 
                Employee_uuid: user.User_uuid,
                Status: Status,
                User: [{ Type, Date: currentDate, Time, CreatedAt: new Date().toISOString() }] 
            });

          
            await newAttendance.save();
            return res.json({ success: true, message: 'New attendance recorded successfully.' });
        }
    } catch (error) {
        console.error('Error saving attendance:', error);
        res.status(500).json({ success: false, message: 'Error saving attendance: ' + error.message });
    }
});


async function getNextAttendanceRecordId() {
    const lastRecord = await Attendance.findOne({}).sort({ Attendance_Record_ID: -1 }).limit(1);
    return lastRecord ? lastRecord.Attendance_Record_ID + 1 : 1; 
}


  

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


 

  module.exports = router;