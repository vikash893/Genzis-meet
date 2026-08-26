const mongoose = require("mongoose");

const meetingAttendanceSchema = new mongoose.Schema({
    meetingId: { type: String, required: true, index: true },
    email: { type: String, required: true },
    joinedAt: { type: Date, required: true },
    leftAt: { type: Date, default: null }
});

meetingAttendanceSchema.index({ meetingId: 1, joinedAt: 1 });

module.exports = mongoose.model("MeetingAttendance", meetingAttendanceSchema);