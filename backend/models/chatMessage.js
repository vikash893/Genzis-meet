const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
    {
        meetingId: {
            type: String,
            required: true,
            index: true
        },
        messageId: {
            type: String,
            required: true
        },
        senderEmail: {
            type: String,
            required: true
        },
        encryptedMessage: {
            type: String,
            required: true
        },
        iv: {
            type: String,
            required: true
        },
        authTag: {
            type: String,
            required: true
        },
        sentAt: {
            type: Date,
            required: true
        }
    },
    { timestamps: true }
);

chatMessageSchema.index({ meetingId: 1, sentAt: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);