const express = require("express");
const Meeting = require("../models/meeting");
const MeetingAttendance = require("../models/meetingAttendance");
const ChatMessage = require("../models/chatMessage");
const users = require("../models/users");
const Subtitle = require("../models/subtitle");
const Recording = require("../models/recording");
const mongoose = require("mongoose");
const { Readable } = require("stream");
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
            const title = String(req.body.title || "Untitled meeting").trim().slice(0, 120) || "Untitled meeting";

            const meeting = await Meeting.create({
                meetingId: meetingId,
                passcode: passcode,
                hostemail: req.user.email,
                hostId: req.user.id,
                title,
                accessMode: "open"
            });

            return res.status(201).json({
                message: "Meeting created successfully",
                meetingId: meeting.meetingId,
                passcode: meeting.passcode,
                title: meeting.title
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

            const meetingKey = String(req.body?.meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            const passkey = String(req.body?.passcode || "").trim();

            if (!meetingKey || !passkey) {
                return res.status(400).json({
                    message: "Meeting ID and passcode are required"
                });
            }

            const meeting = await Meeting.findOne({
                meetingId: meetingKey
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

            if (meeting.passcode !== passkey) {
                return res.status(401).json({
                    message: "Invalid passcode"
                });
            }

            const isHost = meeting.hostemail.toLowerCase() === req.user.email.toLowerCase();
            if (!isHost && meeting.accessMode === "selected" && !meeting.allowedEmails.includes(req.user.email.toLowerCase())) {
                return res.status(403).json({ message: "You are not invited to this meeting" });
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

meetingRouter.patch(
    "/:meetingId/access",
    authMiddleware,
    async (req, res) => {
        try {
            const { accessMode, allowedEmails = [], title } = req.body;
            const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });

            if (!meeting) return res.status(404).json({ message: "Meeting not found" });
            if (meeting.hostemail.toLowerCase() !== req.user.email.toLowerCase()) {
                return res.status(403).json({ message: "Only the host can change meeting access" });
            }
            if (!["open", "selected"].includes(accessMode)) {
                return res.status(400).json({ message: "Invalid access mode" });
            }

            const normalizedEmails = [...new Set(allowedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean))];
            if (accessMode === "selected" && normalizedEmails.length === 0) {
                return res.status(400).json({ message: "Add at least one invited email" });
            }

            meeting.accessMode = accessMode;
            meeting.allowedEmails = accessMode === "selected" ? normalizedEmails : [];
            if (typeof title === "string" && title.trim()) meeting.title = title.trim().slice(0, 120);
            await meeting.save();
            return res.status(200).json({ accessMode: meeting.accessMode, allowedEmails: meeting.allowedEmails });
        } catch (error) {
            console.error("Meeting access update error:", error);
            return res.status(500).json({ message: "Failed to update meeting access" });
        }
    }
);

meetingRouter.delete(
    "/:meetingId",
    authMiddleware,
    async (req, res) => {
        try {
            const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
            if (!meeting) return res.status(404).json({ message: "Meeting not found" });
            if (meeting.hostemail.toLowerCase() !== req.user.email.toLowerCase()) {
                return res.status(403).json({ message: "Only the host can cancel this meeting" });
            }

            await Promise.all([
                Meeting.deleteOne({ _id: meeting._id }),
                MeetingAttendance.deleteMany({ meetingId: meeting.meetingId }),
                ChatMessage.deleteMany({ meetingId: meeting.meetingId })
            ]);

            return res.status(200).json({ message: "Meeting cancelled" });
        } catch (error) {
            console.error("Meeting cancellation error:", error);
            return res.status(500).json({ message: "Failed to cancel meeting" });
        }
    }
);

meetingRouter.get(
    "/history",
    authMiddleware,
    async (req, res) => {
        try {
            const meetings = await Meeting.find({ hostemail: req.user.email }).sort({ createdAt: -1 }).lean();
            const history = await Promise.all(meetings.map(async (meeting) => ({
                ...meeting,
                attendance: await MeetingAttendance.find({ meetingId: meeting.meetingId }).sort({ joinedAt: 1 }).lean(),
                subtitles: await Subtitle.find({ meetingId: meeting.meetingId }).sort({ spokenAt: 1 }).lean(),
                recording: await Recording.findOne({ meetingId: meeting.meetingId }).lean()
            })));
            return res.status(200).json({ meetings: history });
        } catch (error) {
            console.error("Meeting history error:", error);
            return res.status(500).json({ message: "Failed to fetch meeting history" });
        }
    }
);

meetingRouter.post(
    "/:meetingId/recording",
    authMiddleware,
    express.raw({ type: ["video/webm", "video/mp4"], limit: "500mb" }),
    async (req, res) => {
        try {
            const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
            if (!meeting) return res.status(404).json({ message: "Meeting not found" });
            if (meeting.hostemail.toLowerCase() !== req.user.email.toLowerCase()) return res.status(403).json({ message: "Only the host can save a recording" });
            if (!Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ message: "Recording is empty" });
            if (!mongoose.connection.db) return res.status(503).json({ message: "Database is not ready" });

            const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "meetingRecordings" });
            const filename = `meeting-${meeting.meetingId}-${Date.now()}.webm`;
            const uploadStream = bucket.openUploadStream(filename, { contentType: req.headers["content-type"] || "video/webm" });
            Readable.from(req.body).pipe(uploadStream);
            await new Promise((resolve, reject) => {
                uploadStream.on("finish", resolve);
                uploadStream.on("error", reject);
            });

            const recording = await Recording.findOneAndUpdate(
                { meetingId: meeting.meetingId },
                { meetingId: meeting.meetingId, hostId: req.user.id, hostEmail: req.user.email, fileId: uploadStream.id, filename, mimeType: req.headers["content-type"] || "video/webm", size: req.body.length },
                { upsert: true, new: true }
            );
            return res.status(201).json({ recordingId: recording._id, meetingId: meeting.meetingId });
        } catch (error) {
            console.error("Recording save error:", error);
            return res.status(500).json({ message: "Failed to save recording" });
        }
    }
);

meetingRouter.get(
    "/:meetingId/recording/stream",
    authMiddleware,
    async (req, res) => {
        try {
            const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
            if (!meeting) return res.status(404).json({ message: "Meeting not found" });

            const recording = await Recording.findOne({ meetingId: req.params.meetingId }).lean();
            if (!recording) return res.status(404).json({ message: "Recording not found" });

            if (!mongoose.connection.db) return res.status(503).json({ message: "Database is not ready" });

            const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "meetingRecordings" });
            const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(recording.fileId));

            res.setHeader("Content-Type", recording.mimeType || "video/webm");
            res.setHeader("Content-Disposition", "inline");
            if (recording.size) {
                res.setHeader("Content-Length", recording.size);
            }
            res.setHeader("Accept-Ranges", "bytes");

            downloadStream.on("error", (err) => {
                console.error("GridFS stream error:", err);
                if (!res.headersSent) res.status(500).json({ message: "Failed to stream recording" });
            });

            return downloadStream.pipe(res);
        } catch (error) {
            console.error("Stream recording error:", error);
            return res.status(500).json({ message: "Failed to stream recording" });
        }
    }
);

meetingRouter.get(
    "/:meetingId/recording",
    authMiddleware,
    async (req, res) => {
        try {
            const meeting = await Meeting.findOne({ meetingId: req.params.meetingId });
            if (!meeting) return res.status(404).json({ message: "Meeting not found" });

            const Recording = require("../models/recording");
            const recording = await Recording.findOne({ meetingId: req.params.meetingId }).lean();
            if (!recording) return res.status(404).json({ message: "Recording not found" });

            if (meeting.hostemail.toLowerCase() !== req.user.email.toLowerCase()) {
                return res.status(403).json({ message: "Only the host can download the recording" });
            }

            if (!mongoose.connection.db) return res.status(503).json({ message: "Database is not ready" });

            const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "meetingRecordings" });
            const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(recording.fileId));

            res.setHeader("Content-Type", recording.mimeType || "video/webm");
            res.setHeader("Content-Disposition", `attachment; filename="NexusMeet-Recording-${meeting.meetingId}.webm"`);

            downloadStream.on("error", (err) => {
                console.error("GridFS download error:", err);
                if (!res.headersSent) res.status(500).json({ message: "Failed to download recording" });
            });

            return downloadStream.pipe(res);
        } catch (error) {
            console.error("Download recording error:", error);
            return res.status(500).json({ message: "Failed to download recording" });
        }
    }
);

meetingRouter.get(
    "/history/:meetingId.csv",
    authMiddleware,
    async (req, res) => {
        try {
            const meeting = await Meeting.findOne({ meetingId: req.params.meetingId }).lean();
            if (!meeting) return res.status(404).json({ message: "Meeting not found" });
            if (meeting.hostemail.toLowerCase() !== req.user.email.toLowerCase()) {
                return res.status(403).json({ message: "Only the host can download attendance" });
            }

            const attendance = await MeetingAttendance.find({ meetingId: meeting.meetingId }).sort({ joinedAt: 1 }).lean();
            const csvRows = ["meeting_id,email,joined_at,left_at"];
            for (const record of attendance) {
                csvRows.push([meeting.meetingId, record.email, record.joinedAt.toISOString(), record.leftAt ? record.leftAt.toISOString() : ""].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
            }

            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename="meeting-${meeting.meetingId}-attendance.csv"`);
            return res.send(csvRows.join("\n"));
        } catch (error) {
            console.error("Attendance download error:", error);
            return res.status(500).json({ message: "Failed to download attendance" });
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