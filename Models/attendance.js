const mongoose = require('mongoose');

const AttendanceSchema=new mongoose.Schema({
    Attendance_uuid: { type: String },
    Attendance_Record_ID: { type: Number, required: true, unique: true },
    Employee_uuid: { type: String, required: true },   
    Date: { type: Date, required: true },
    Check_in_time: { type: Time, required: true },
    Check_out_time: { type: Time, required: true },
    total_hours: { type: Number, required: true },
    Status: { type: Date, required: true },
 })

 const Attendance = mongoose.model("Attendance", AttendanceSchema);

module.exports = Attendance;