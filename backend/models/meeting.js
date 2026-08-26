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

        hostId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "user",
            required: true
        },

        title: {
            type: String,
            default: "Untitled meeting",
            trim: true,
            maxlength: 120
        },

        accessMode: {
            type: String,
            enum: ["open", "selected"],
            default: "open"
        },

        allowedEmails: {
            type: [String],
            default: []
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

        startedAt: {
            type: Date,
            default: null
        },

        endedAt: {
            type: Date,
            default: null
        }
    }
);

module.exports = mongoose.model("Meeting", meetingSchema);