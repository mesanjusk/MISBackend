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

// Indexes to speed up lookups and sorting
AttendanceSchema.index({ Attendance_Record_ID: 1 });
AttendanceSchema.index({ Employee_uuid: 1 });
AttendanceSchema.index({ Date: 1 });
AttendanceSchema.index({ Status: 1 });

const Attendance = mongoose.model("Attendance", AttendanceSchema);
module.exports = Attendance;
