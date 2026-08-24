const mongoose = require("mongoose");

const meetingSchema = new mongoose.Schema(
    {
        meetingId: {
            type: String,
            required: true,
            unique: true
        },

        passcode: {
            type: String,
            required: true
        },

        hostemail: {
            type: String,
            required: true
        },

        status: {
            type: String,
            enum: ["active", "ended"],
            default: "active"
        },

        createdAt: {
            type: Date,
            default: Date.now
        },

        endedAt: {
            type: Date,
            default: null
        }
    }
);

module.exports = mongoose.model("Meeting", meetingSchema);