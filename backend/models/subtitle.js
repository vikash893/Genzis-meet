const mongoose = require("mongoose");

const subtitleSchema = new mongoose.Schema({
    meetingId: { type: String, required: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
    email: { type: String, required: true },
    text: { type: String, required: true },
    spokenAt: { type: Date, default: Date.now }
});

subtitleSchema.index({ meetingId: 1, spokenAt: 1 });

module.exports = mongoose.model("Subtitle", subtitleSchema);