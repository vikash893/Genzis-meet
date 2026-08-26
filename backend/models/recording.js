const mongoose = require("mongoose");

const recordingSchema = new mongoose.Schema({
    meetingId: { type: String, required: true, unique: true },
    hostId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    hostEmail: { type: String, required: true },
    fileId: { type: mongoose.Schema.Types.ObjectId, required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Recording", recordingSchema);