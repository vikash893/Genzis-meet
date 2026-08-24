const express = require("express");
const Meeting = require("../models/meeting");
const authMiddleware = require("../middleware/authMiddleware");

const meetingRouter = express.Router();


function generateMeetingId() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generatePasscode() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

meetingRouter.post(
    "/create",
    authMiddleware,
    async (req, res) => {

        try {
            let meetingId = generateMeetingId();
            let isDuplicate = await Meeting.findOne({ meetingId });

            // Retry loop in case of random collision
            let attempts = 0;
            while (isDuplicate && attempts < 10) {
                meetingId = generateMeetingId();
                isDuplicate = await Meeting.findOne({ meetingId });
                attempts++;
            }

            const passcode = generatePasscode();

            const meeting = await Meeting.create({
                meetingId: meetingId,
                passcode: passcode,
                hostemail: req.user.email
            });

            return res.status(201).json({
                message: "Meeting created successfully",
                meetingId: meeting.meetingId,
                passcode: meeting.passcode
            });

        } catch (error) {

            console.error("Create meeting error:", error);

            return res.status(500).json({
                message: "Failed to create meeting",
                error: error.message
            });
        }
    }
);


meetingRouter.post(
    "/join",
    authMiddleware,
    async (req, res) => {

        try {

            const { meetingId, passcode } = req.body;

            if (!meetingId || !passcode) {
                return res.status(400).json({
                    message: "Meeting ID and passcode are required"
                });
            }

            const meeting = await Meeting.findOne({
                meetingId: meetingId
            });

            if (!meeting) {
                return res.status(404).json({
                    message: "Meeting not found"
                });
            }

            if (meeting.status === "ended") {
                return res.status(400).json({
                    message: "Meeting has already ended"
                });
            }

            if (meeting.passcode !== passcode) {
                return res.status(401).json({
                    message: "Invalid passcode"
                });
            }

            return res.status(200).json({
                message: "Joined meeting successfully",
                meetingId: meeting.meetingId,
                hostemail: meeting.hostemail,
                useremail: req.user.email
            });

        } catch (error) {

            console.error(error);

            return res.status(500).json({
                message: "Failed to join meeting"
            });
        }
    }
);

// End Meeting Route (Host only or Admin)
meetingRouter.post(
    "/end",
    authMiddleware,
    async (req, res) => {
        try {
            const { meetingId } = req.body;
            if (!meetingId) {
                return res.status(400).json({ message: "Meeting ID is required" });
            }

            const meeting = await Meeting.findOne({ meetingId });
            if (!meeting) {
                return res.status(404).json({ message: "Meeting not found" });
            }

            meeting.status = "ended";
            meeting.endedAt = new Date();
            await meeting.save();

            return res.status(200).json({
                message: "Meeting ended successfully",
                meetingId: meeting.meetingId
            });
        } catch (error) {
            console.error("End meeting error:", error);
            return res.status(500).json({ message: "Failed to end meeting" });
        }
    }
);

// Get Active & Recent Meetings List
meetingRouter.get(
    "/active",
    authMiddleware,
    async (req, res) => {
        try {
            const meetings = await Meeting.find({ status: "active" })
                .sort({ createdAt: -1 })
                .limit(20);

            return res.status(200).json({
                meetings
            });
        } catch (error) {
            console.error("Get active meetings error:", error);
            return res.status(500).json({ message: "Failed to fetch meetings" });
        }
    }
);

module.exports = meetingRouter;