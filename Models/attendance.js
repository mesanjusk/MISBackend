const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    Time: { type: String, required: true },
    Type: { type: String, required: true },
    CreatedAt: { type: Date, required: true} 
});

const AttendanceSchema = new mongoose.Schema({
    Attendance_uuid: { type: String },
    Attendance_Record_ID: { type: Number, required: true, unique: true },
    Employee_uuid: { type: String, required: true }, 
    Date: { type: Date, required: true },      
    Status: { type: String, required: true },
    User: [userSchema] 
});

const Attendance = mongoose.model("Attendance", AttendanceSchema);
module.exports = Attendance;
