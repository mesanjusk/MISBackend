const { v4: uuid } = require('uuid');
const Attendance = require('../repositories/attendance');

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const markAttendance = async ({
  employeeId,
  source = 'dashboard',
  type = 'In',
  status = 'Active',
  time,
  preventDuplicateForType = null,
}) => {
  if (!employeeId) {
    throw new Error('employeeId is required to mark attendance');
  }

  const attendanceDate = getTodayDateString();
  const entryTime = time || new Date().toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  let todayAttendance = await Attendance.findOne({
    Employee_uuid: employeeId,
    Date: attendanceDate,
  });

  if (todayAttendance) {
    const alreadyMarked =
      preventDuplicateForType &&
      Array.isArray(todayAttendance.User) &&
      todayAttendance.User.some((entry) => String(entry?.Type || '').toLowerCase() === String(preventDuplicateForType).toLowerCase());

    if (alreadyMarked) {
      return { attendance: todayAttendance, created: false, duplicate: true };
    }

    todayAttendance.User.push({ Type: type, Time: entryTime, CreatedAt: new Date() });

    // Preserve original source if already set by dashboard, otherwise set from current marker
    if (!todayAttendance.source) {
      todayAttendance.source = source;
    }

    await todayAttendance.save();
    return { attendance: todayAttendance, created: false, duplicate: false };
  }

  const lastAttendanceRecord = await Attendance.findOne().sort({ Attendance_Record_ID: -1 });
  const newAttendanceRecordId = lastAttendanceRecord ? lastAttendanceRecord.Attendance_Record_ID + 1 : 1;

  todayAttendance = new Attendance({
    Attendance_uuid: uuid(),
    Attendance_Record_ID: newAttendanceRecordId,
    Employee_uuid: employeeId,
    Date: attendanceDate,
    Status: status,
    source,
    User: [{ Type: type, Time: entryTime, CreatedAt: new Date() }],
  });

  await todayAttendance.save();
  return { attendance: todayAttendance, created: true, duplicate: false };
};

module.exports = {
  markAttendance,
};
