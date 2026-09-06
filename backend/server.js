const dotenv = require("dotenv").config();
const express = require("express");
const connectDb = require("./config/db");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const adminRouter = require("./routers/admin");
const announcementRouter = require("./routers/announcement");
const userRouter = require("./routers/user");
const meetingRouter = require("./routers/meetingRouter");
const Meeting = require("./models/meeting");
const ChatMessage = require("./models/chatMessage");
const MeetingAttendance = require("./models/meetingAttendance");
const Subtitle = require("./models/subtitle");
const User = require("./models/users");
const router = require("./routers/health");

const chatEncryptionKey = crypto
    .createHash("sha256")
    .update(process.env.CHAT_ENCRYPTION_KEY || process.env.JWT_SECRET || "genzis-meet-secure-chat-key-2026")
    .digest();

function encryptChatMessage(message) {
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv("aes-256-gcm", chatEncryptionKey, iv);
        const encryptedMessage = Buffer.concat([
            cipher.update(message, "utf8"),
            cipher.final()
        ]);

        return {
            encryptedMessage: encryptedMessage.toString("base64"),
            iv: iv.toString("base64"),
            authTag: cipher.getAuthTag().toString("base64")
        };
    } catch (err) {
        console.error("Encryption error:", err);
        return {
            encryptedMessage: Buffer.from(message, "utf8").toString("base64"),
            iv: "plain",
            authTag: "plain"
        };
    }
}

function decryptChatMessage(chatMessage) {
    if (!chatMessage || !chatMessage.encryptedMessage) {
        return chatMessage?.message || "";
    }
    if (chatMessage.iv === "plain" || chatMessage.authTag === "plain") {
        try {
            return Buffer.from(chatMessage.encryptedMessage, "base64").toString("utf8");
        } catch {
            return chatMessage.encryptedMessage;
        }
    }
    try {
        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            chatEncryptionKey,
            Buffer.from(chatMessage.iv, "base64")
        );
        decipher.setAuthTag(Buffer.from(chatMessage.authTag, "base64"));

        return Buffer.concat([
            decipher.update(Buffer.from(chatMessage.encryptedMessage, "base64")),
            decipher.final()
        ]).toString("utf8");
    } catch (err) {
        // Fallback if key changed or data was plaintext
        try {
            return Buffer.from(chatMessage.encryptedMessage, "base64").toString("utf8");
        } catch {
            return chatMessage.message || "[Message unavailable]";
        }
    }
}


// ==========================================
// EXPRESS APP
// ==========================================

const app = express();

const port = process.env.PORT || 8000;


// ==========================================
// MIDDLEWARE
// ==========================================

app.use(
    cors({
        origin: "*",
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    })
);

app.use(
    express.json()
);


// ==========================================
// ROUTERS
// ==========================================

app.use(
    "/api/admin",
    adminRouter
);

app.use(
    "/api/announcement",
    announcementRouter
);

app.use(
    "/api/user",
    userRouter
);

app.use(
    "/meeting",
    meetingRouter
);
app.use("/health", router);

// ==========================================
// HTTP SERVER
// ==========================================

const httpServer =
    http.createServer(app)


// ==========================================
// SOCKET.IO
// ==========================================

const io = new Server(
    httpServer,
    {
        pingTimeout: 60000,
        pingInterval: 25000,
        cors: {
            origin: "*",
            methods: [
                "GET",
                "POST"
            ]
        }
    }
);

io.use((socket, next) => {
    try {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (!token) {
            return next(new Error("Authentication required"));
        }

        const jwtSecret = process.env.JWT_SECRET || "default_jwt_secret_key_123";
        socket.user = jwt.verify(token, jwtSecret);
        next();
    } catch (error) {
        next(new Error("Invalid or expired token"));
    }
});

// ==========================================
// MEETING USERS
//
// meetingUsers:
//
// Map(
//   meetingId => [
//      {
//          socketId,
//          email
//      }
//   ]
// )
//
// meetingHosts:
//
// Map( meetingId => hostSocketId )
//
// ==========================================

const meetingUsers = new Map();
const meetingHosts = new Map();
const disconnectTimers = new Map();


// ==========================================
// SOCKET CONNECTION
// ==========================================

io.on(
    "connection",
    (socket) => {

        console.log(
            "User connected:",
            socket.id
        );


        // ==========================================
        // JOIN MEETING
        // ==========================================

        socket.on(
            "join-meeting",
            async ({
                meetingId,
                passcode
            }) => {

                const email = socket.user.email;
                const normalizedMeetingId = String(meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                const normalizedPasscode = String(passcode || "").trim();

                console.log(
                    `${email} wants to join ${normalizedMeetingId}`
                );

                // Verify meeting is not ended in database
                let meetingRecord = null;
                try {
                    meetingRecord = await Meeting.findOne({ meetingId: normalizedMeetingId });
                    if (!meetingRecord) {
                        socket.emit("meeting-access-denied", { message: "Meeting not found" });
                        return;
                    }
                    if (meetingRecord && meetingRecord.status === "ended") {
                        console.log(`Rejecting join for ended meeting ${normalizedMeetingId}`);
                        socket.emit("meeting-ended-by-host");
                        return;
                    }
                    const isHost = meetingRecord.hostemail.toLowerCase() === email.toLowerCase();
                    const isInvited = isHost || meetingRecord.accessMode !== "selected" || (meetingRecord.allowedEmails && meetingRecord.allowedEmails.includes(email.toLowerCase()));
                    
                    if (!isHost && meetingRecord.passcode !== normalizedPasscode) {
                        socket.emit("meeting-access-denied", { message: "Invalid meeting passcode" });
                        return;
                    }
                    if (!isInvited) {
                        socket.emit("meeting-access-denied", { message: "You are not invited to this meeting" });
                        return;
                    }
                } catch (err) {
                    console.error("DB meeting status check error:", err);
                    socket.emit("meeting-access-denied", { message: "Unable to verify meeting access" });
                    return;
                }

                // ------------------------------------------
                // Join Socket.IO room
                // ------------------------------------------

                if (!meetingRecord.startedAt) {
                    meetingRecord.startedAt = new Date();
                    await meetingRecord.save();
                }

                socket.join(
                    normalizedMeetingId
                );


                // ------------------------------------------
                // Create meeting if not exists
                // Verify host from Database record or first joiner
                // ------------------------------------------

                if (
                    !meetingUsers.has(
                        normalizedMeetingId
                    )
                ) {

                    meetingUsers.set(
                        normalizedMeetingId,
                        []
                    );

                }

                // Identify Host: If joining user's email matches meeting's database hostemail OR if no host is set yet
                const isDatabaseHost = meetingRecord && meetingRecord.hostemail && meetingRecord.hostemail.toLowerCase() === (email || "").toLowerCase();

                if (isDatabaseHost || !meetingHosts.has(normalizedMeetingId)) {
                    meetingHosts.set(
                        normalizedMeetingId,
                        socket.id
                    );

                    console.log(
                        `Host of ${normalizedMeetingId} set to: ${email} (${socket.id})`
                    );
                }


                const users =
                    meetingUsers.get(
                        normalizedMeetingId
                    );


                // ------------------------------------------
                // Check duplicate socket / email reconnect
                // ------------------------------------------

                const existingUserByEmail = users.find(
                    user => user.email && user.email.toLowerCase() === email.toLowerCase()
                );

                const alreadyJoined =
                    users.some(
                        user =>
                            user.socketId ===
                            socket.id
                    );


                // ------------------------------------------
                // Add or update user
                // ------------------------------------------

                let previousSocketId = null;
                if (existingUserByEmail) {
                    previousSocketId = existingUserByEmail.socketId;
                    existingUserByEmail.socketId = socket.id;
                    if (previousSocketId && previousSocketId !== socket.id) {
                        socket.to(normalizedMeetingId).emit("user-left", { socketId: previousSocketId, email });
                        console.log(`Replaced old socket ${previousSocketId} with ${socket.id} for ${email}`);
                    }
                } else if (!alreadyJoined) {
                    users.push({
                        socketId: socket.id,
                        email: email
                    });

                    try {
                        const joinedAt = new Date();
                        await MeetingAttendance.create({
                            meetingId: normalizedMeetingId,
                            email,
                            joinedAt
                        });
                        if (socket.user && socket.user.id) {
                            await User.findByIdAndUpdate(socket.user.id, {
                                $push: {
                                    meetingHistory: {
                                        meetingId: normalizedMeetingId,
                                        title: meetingRecord.title || "Untitled meeting",
                                        joinedAt
                                    }
                                }
                            });
                        }
                    } catch (error) {
                        console.error("Attendance save error:", error);
                    }
                }

                // Cancel pending disconnect timer if user reconnected
                const timerKey = `${normalizedMeetingId}:${email}`;
                if (disconnectTimers.has(timerKey)) {
                    clearTimeout(disconnectTimers.get(timerKey));
                    disconnectTimers.delete(timerKey);
                    console.log(`Cancelled disconnect timer for ${email} in ${normalizedMeetingId}`);
                }

                console.log(
                    "Participants in meeting:",
                    users
                );


                // ------------------------------------------
                // Send participant list & meeting info
                // ------------------------------------------

                socket.emit("meeting-info", {
                    meetingId: meetingRecord.meetingId,
                    title: meetingRecord.title || "Untitled meeting",
                    passcode: meetingRecord.passcode
                });

                try {
                    const savedMessages = await ChatMessage.find({ meetingId: normalizedMeetingId })
                        .sort({ sentAt: 1 })
                        .lean();

                    const chatHistory = savedMessages.map((savedMessage) => {
                        try {
                            return {
                                id: savedMessage.messageId || `${savedMessage._id}`,
                                meetingId: savedMessage.meetingId,
                                email: savedMessage.senderEmail,
                                message: decryptChatMessage(savedMessage),
                                timestamp: savedMessage.sentAt ? savedMessage.sentAt.toISOString() : new Date().toISOString()
                            };
                        } catch {
                            return {
                                id: savedMessage.messageId || `${savedMessage._id}`,
                                meetingId: savedMessage.meetingId,
                                email: savedMessage.senderEmail,
                                message: savedMessage.message || "[Message unavailable]",
                                timestamp: savedMessage.sentAt ? savedMessage.sentAt.toISOString() : new Date().toISOString()
                            };
                        }
                    });

                    socket.emit("chat-history", chatHistory);
                } catch (error) {
                    console.error("Chat history load error:", error);
                    socket.emit("chat-history", []);
                }

                io.to(
                    normalizedMeetingId
                ).emit(
                    "participants",
                    users
                );


                // ------------------------------------------
                // Tell everyone who the HOST is
                // ------------------------------------------

                const hostSocketId =
                    meetingHosts.get(normalizedMeetingId);

                io.to(
                    normalizedMeetingId
                ).emit(
                    "host-info",
                    {
                        hostSocketId: hostSocketId
                    }
                );


                // ------------------------------------------
                // Tell existing users new user joined
                // ------------------------------------------

                socket.to(
                    normalizedMeetingId
                ).emit(
                    "user-joined",
                    {
                        socketId:
                            socket.id,
                        email:
                            email
                    }
                );

            }
        );


        // ==========================================
        // WEBRTC OFFER
        // ==========================================

        socket.on(
            "offer",
            ({
                targetSocketId,
                offer
            }) => {

                console.log(
                    "Offer received from:",
                    socket.id
                );


                console.log(
                    "Sending offer to:",
                    targetSocketId
                );


                io.to(
                    targetSocketId
                ).emit(
                    "offer",
                    {

                        fromSocketId:
                            socket.id,

                        offer:
                            offer

                    }
                );

            }
        );


        // ==========================================
        // WEBRTC ANSWER
        // ==========================================

        socket.on(
            "answer",
            ({
                targetSocketId,
                answer
            }) => {

                console.log(
                    "Answer received from:",
                    socket.id
                );


                console.log(
                    "Sending answer to:",
                    targetSocketId
                );


                io.to(
                    targetSocketId
                ).emit(
                    "answer",
                    {

                        fromSocketId:
                            socket.id,

                        answer:
                            answer

                    }
                );

            }
        );


        // ==========================================
        // ICE CANDIDATE
        // ==========================================

        socket.on(
            "ice-candidate",
            ({
                targetSocketId,
                candidate
            }) => {

                console.log(
                    "ICE candidate received from:",
                    socket.id
                );


                console.log(
                    "Sending ICE candidate to:",
                    targetSocketId
                );


                io.to(
                    targetSocketId
                ).emit(
                    "ice-candidate",
                    {

                        fromSocketId:
                            socket.id,

                        candidate:
                            candidate

                    }
                );

            }
        );


        // ==========================================
        // RAISE / LOWER HAND
        // ==========================================

        socket.on(
            "raise-hand",
            ({ meetingId, email, isHandRaised }) => {
                const normalizedMeetingId = String(meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                console.log(`${email} hand raised state: ${isHandRaised} in meeting ${normalizedMeetingId}`);
                io.to(normalizedMeetingId).emit("user-hand-raised", {
                    socketId: socket.id,
                    email,
                    isHandRaised
                });
            }
        );


        // ==========================================
        // EMOJI REACTIONS
        // ==========================================

        socket.on(
            "send-reaction",
            ({ meetingId, email, emoji }) => {
                const normalizedMeetingId = String(meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                console.log(`Reaction ${emoji} from ${email} in ${normalizedMeetingId}`);
                io.to(normalizedMeetingId).emit("receive-reaction", {
                    socketId: socket.id,
                    email,
                    emoji,
                    id: `${Date.now()}-${socket.id}`
                });
            }
        );


        // ==========================================
        // USER MEDIA STATE SYNC
        // ==========================================

        socket.on(
            "user-media-state",
            ({ meetingId, email, isMuted, isCameraOff }) => {
                const normalizedMeetingId = String(meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                socket.to(normalizedMeetingId).emit("user-media-state-changed", {
                    socketId: socket.id,
                    email,
                    isMuted,
                    isCameraOff
                });
            }
        );


        // ==========================================
        // PRIVACY MODE TOGGLE
        // ==========================================

        socket.on(
            "toggle-privacy-mode",
            ({ meetingId, isPrivacyMode }) => {
                const normalizedMeetingId = String(meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
                console.log(`Privacy mode set to ${isPrivacyMode} in ${normalizedMeetingId}`);
                io.to(normalizedMeetingId).emit("privacy-mode-changed", {
                    isPrivacyMode
                });
            }
        );


        // ==========================================
        // HOST END MEETING FOR ALL
        // ==========================================

        socket.on(
            "end-meeting",
            async ({ meetingId }) => {
                const normalizedMeetingId = String(meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

                // Only the HOST can end the meeting
                const hostSocketId =
                    meetingHosts.get(normalizedMeetingId);

                if (
                    hostSocketId &&
                    hostSocketId !== socket.id
                ) {
                    console.log(
                        `Non-host ${socket.id} tried to end ${normalizedMeetingId} — blocked`
                    );
                    return;
                }

                console.log(
                    `HOST ended meeting ${normalizedMeetingId}`
                );

                // Update database status to "ended" so no user can join again
                try {
                    await Meeting.findOneAndUpdate(
                        { meetingId: normalizedMeetingId },
                        { status: "ended", endedAt: new Date() }
                    );
                    console.log(`Meeting ${normalizedMeetingId} marked as ended in DB.`);
                } catch (err) {
                    console.error("DB update error on end-meeting:", err);
                }

                // Notify ALL clients in the room
                io.to(normalizedMeetingId).emit(
                    "meeting-ended-by-host"
                );

                // Force-disconnect every socket in room
                const roomSockets =
                    await io.in(normalizedMeetingId).fetchSockets();

                for (const s of roomSockets) {
                    s.leave(normalizedMeetingId);
                }

                // Clean up server state
                meetingUsers.delete(normalizedMeetingId);
                meetingHosts.delete(normalizedMeetingId);
            }
        );


        // ==========================================
        // LIVE SUBTITLES
        // ==========================================

        socket.on("send-subtitle", async ({ meetingId, text, timestamp }) => {
            const normalizedMeetingId = String(meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
            const cleanText = typeof text === "string" ? text.trim() : "";
            const usersInMeeting = meetingUsers.get(normalizedMeetingId);
            const sender = usersInMeeting && usersInMeeting.find((user) => user.socketId === socket.id);
            if (!sender || !cleanText || cleanText.length > 500) return;

            const spokenAt = timestamp ? new Date(timestamp) : new Date();
            if (Number.isNaN(spokenAt.getTime())) return;

            try {
                await Subtitle.create({
                    meetingId: normalizedMeetingId,
                    userId: socket.user.id,
                    email: sender.email,
                    text: cleanText,
                    spokenAt
                });
                await User.findByIdAndUpdate(socket.user.id, {
                    $push: { subtitleHistory: { meetingId: normalizedMeetingId, text: cleanText, spokenAt } }
                });
                io.to(normalizedMeetingId).emit("subtitle", {
                    meetingId: normalizedMeetingId,
                    userId: socket.user.id,
                    email: sender.email,
                    text: cleanText,
                    spokenAt: spokenAt.toISOString()
                });
            } catch (error) {
                console.error("Subtitle save error:", error);
            }
        });

        // ==========================================
        // LIVE CHAT
        // ==========================================

        socket.on(
            "send-message",
            async ({
                meetingId,
                message,
                id,
                timestamp
            }) => {
                const normalizedMeetingId = String(meetingId || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");

                console.log(
                    "================================"
                );


                console.log(
                    "CHAT MESSAGE RECEIVED"
                );


                console.log(
                    "Socket:",
                    socket.id
                );


                console.log(
                    "Meeting:",
                    meetingId
                );


                console.log(
                    "Email:",
                    socket.user.email
                );


                console.log(
                    "Message:",
                    message
                );


                console.log(
                    "================================"
                );


                // ------------------------------------------
                // Validate message
                // ------------------------------------------

                if (
                    !normalizedMeetingId ||
                    !message ||
                    !message.trim()
                ) {

                    console.log(
                        "Invalid chat message"
                    );

                    return;

                }


                // ------------------------------------------
                // Find meeting
                // ------------------------------------------

                let users =
                    meetingUsers.get(
                        normalizedMeetingId
                    );

                if (!users) {
                    users = [];
                    meetingUsers.set(normalizedMeetingId, users);
                }

                // ------------------------------------------
                // Check sender
                // ------------------------------------------

                let sender =
                    users.find(
                        user =>
                            user.socketId ===
                            socket.id
                    );

                if (!sender) {
                    const userEmail = socket.user ? socket.user.email : null;
                    if (userEmail) {
                        sender = users.find(user => user.email && user.email.toLowerCase() === userEmail.toLowerCase());
                        if (sender) {
                            sender.socketId = socket.id;
                        } else {
                            sender = { socketId: socket.id, email: userEmail };
                            users.push(sender);
                        }
                    }
                }

                const senderEmail = sender ? sender.email : (socket.user && socket.user.email) || "Guest User";
                const cleanMessage = message.trim();
                const messageId = id || `${Date.now()}-${socket.id}-${Math.random().toString(36).substring(2, 7)}`;
                const sentAt = timestamp ? new Date(timestamp) : new Date();

                if (Number.isNaN(sentAt.getTime())) {
                    return;
                }

                try {
                    const encrypted = encryptChatMessage(cleanMessage);
                    await ChatMessage.create({
                        meetingId: normalizedMeetingId,
                        messageId,
                        senderEmail,
                        ...encrypted,
                        sentAt
                    });
                } catch (error) {
                    console.error("Chat message save error:", error);
                }

                const chatMessage = {
                    id: messageId,
                    meetingId: normalizedMeetingId,
                    email: senderEmail,
                    message: cleanMessage,
                    timestamp: sentAt.toISOString()
                };

                // Broadcast message to EVERYONE in the meeting room
                io.to(normalizedMeetingId).emit("receive-message", chatMessage);

                console.log(
                    "Message broadcast completed"
                );

            }
        );


        // ==========================================
        // DISCONNECT
        // ==========================================

        socket.on("disconnect", async () => {
            console.log("User disconnected:", socket.id);

            for (const [meetingId, users] of meetingUsers) {
                const disconnectedIndex = users.findIndex((user) => user.socketId === socket.id);
                if (disconnectedIndex === -1) continue;

                const disconnectedUser = users[disconnectedIndex];
                const timerKey = `${meetingId}:${disconnectedUser.email}`;

                // Cancel any existing timer for this user (shouldn't happen, but be safe)
                if (disconnectTimers.has(timerKey)) {
                    clearTimeout(disconnectTimers.get(timerKey));
                }

                // Grace period: wait 5 seconds before actually removing
                const timer = setTimeout(async () => {
                    disconnectTimers.delete(timerKey);

                    const currentUsers = meetingUsers.get(meetingId);
                    if (!currentUsers) return;

                    // Check if user reconnected with a new socket
                    const reconnectedUser = currentUsers.find(
                        (u) => u.email && u.email.toLowerCase() === disconnectedUser.email.toLowerCase() && u.socketId !== socket.id
                    );
                    if (reconnectedUser) {
                        console.log(`User ${disconnectedUser.email} reconnected to ${meetingId}, skipping removal`);
                        return;
                    }

                    // User did not reconnect — remove them
                    const removeIndex = currentUsers.findIndex((u) => u.socketId === socket.id);
                    if (removeIndex === -1) return;
                    currentUsers.splice(removeIndex, 1);

                    try {
                        const leftAt = new Date();
                        await MeetingAttendance.findOneAndUpdate(
                            { meetingId, email: disconnectedUser.email, leftAt: null },
                            { leftAt },
                            { sort: { joinedAt: -1 } }
                        );
                        if (socket.user && socket.user.id) {
                            await User.findOneAndUpdate(
                                { _id: socket.user.id, "meetingHistory.meetingId": meetingId, "meetingHistory.leftAt": null },
                                { $set: { "meetingHistory.$.leftAt": leftAt } },
                                { sort: { "meetingHistory.joinedAt": -1 } }
                            );
                        }
                    } catch (error) {
                        console.error("Attendance close error:", error);
                    }

                    if (currentUsers.length === 0) {
                        meetingUsers.delete(meetingId);
                        meetingHosts.delete(meetingId);
                        console.log(`Meeting ${meetingId} is now empty`);
                    } else {
                        io.to(meetingId).emit("participants", currentUsers);
                        io.to(meetingId).emit("user-left", { socketId: socket.id, email: disconnectedUser.email });
                    }
                }, 5000);

                disconnectTimers.set(timerKey, timer);
            }
        });

    }
);


// ==========================================
// START SERVER
// ==========================================

const startServer =
    async () => {

        try {

            // Start HTTP and Socket.IO before database initialization so a
            // transient MongoDB outage cannot make the service unavailable.
            httpServer.listen(
                port,
                () => {
                    console.log(
                        `Server running on port ${port}`
                    );
                }
            );

            // ------------------------------------------
            // Database
            // ------------------------------------------

            await connectDb();


        } catch (error) {

            console.error(
                "Server connection error:",
                error
            );

        }

    };


startServer();

