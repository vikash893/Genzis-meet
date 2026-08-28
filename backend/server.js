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

const chatEncryptionKey = crypto
    .createHash("sha256")
    .update(process.env.CHAT_ENCRYPTION_KEY || process.env.JWT_SECRET || "change-this-chat-key")
    .digest();

function encryptChatMessage(message) {
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
}

function decryptChatMessage(chatMessage) {
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
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        credentials: true
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


// ==========================================
// HTTP SERVER
// ==========================================

const httpServer =
    http.createServer(app);


// ==========================================
// SOCKET.IO
// ==========================================

const io = new Server(
    httpServer,
    {
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

                console.log(
                    `${email} wants to join ${meetingId}`
                );

                // Verify meeting is not ended in database
                let meetingRecord = null;
                try {
                    meetingRecord = await Meeting.findOne({ meetingId: meetingId });
                    if (!meetingRecord) {
                        socket.emit("meeting-access-denied", { message: "Meeting not found" });
                        return;
                    }
                    if (meetingRecord && meetingRecord.status === "ended") {
                        console.log(`Rejecting join for ended meeting ${meetingId}`);
                        socket.emit("meeting-ended-by-host");
                        return;
                    }
                    const isHost = meetingRecord.hostemail.toLowerCase() === email.toLowerCase();
                    const isInvited = isHost || meetingRecord.accessMode !== "selected" || meetingRecord.allowedEmails.includes(email.toLowerCase());
                    if (!isHost && meetingRecord.passcode !== passcode) {
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
                    meetingId
                );


                // ------------------------------------------
                // Create meeting if not exists
                // Verify host from Database record or first joiner
                // ------------------------------------------

                if (
                    !meetingUsers.has(
                        meetingId
                    )
                ) {

                    meetingUsers.set(
                        meetingId,
                        []
                    );

                }

                // Identify Host: If joining user's email matches meeting's database hostemail OR if no host is set yet
                const isDatabaseHost = meetingRecord && meetingRecord.hostemail && meetingRecord.hostemail.toLowerCase() === (email || "").toLowerCase();

                if (isDatabaseHost || !meetingHosts.has(meetingId)) {
                    meetingHosts.set(
                        meetingId,
                        socket.id
                    );

                    console.log(
                        `Host of ${meetingId} set to: ${email} (${socket.id})`
                    );
                }


                const users =
                    meetingUsers.get(
                        meetingId
                    );


                // ------------------------------------------
                // Check duplicate socket
                // ------------------------------------------

                const alreadyJoined =
                    users.some(
                        user =>
                            user.socketId ===
                            socket.id
                    );


                // ------------------------------------------
                // Add user
                // ------------------------------------------

                if (!alreadyJoined) {

                    users.push({

                        socketId:
                            socket.id,

                        email:
                            email

                    });

                    try {
                        const joinedAt = new Date();
                        await MeetingAttendance.create({
                            meetingId,
                            email,
                            joinedAt
                        });
                        await User.findByIdAndUpdate(socket.user.id, {
                            $push: {
                                meetingHistory: {
                                    meetingId,
                                    title: meetingRecord.title || "Untitled meeting",
                                    joinedAt
                                }
                            }
                        });
                    } catch (error) {
                        console.error("Attendance save error:", error);
                    }

                }


                console.log(
                    "Participants in meeting:",
                    users
                );


                // ------------------------------------------
                // Send participant list
                // ------------------------------------------

                socket.emit("meeting-info", {
                    meetingId: meetingRecord.meetingId,
                    title: meetingRecord.title || "Untitled meeting"
                });

                try {
                    const savedMessages = await ChatMessage.find({ meetingId })
                        .sort({ sentAt: 1 })
                        .lean();

                    const chatHistory = savedMessages.map((savedMessage) => ({
                        id: savedMessage.messageId,
                        meetingId: savedMessage.meetingId,
                        email: savedMessage.senderEmail,
                        message: decryptChatMessage(savedMessage),
                        timestamp: savedMessage.sentAt.toISOString()
                    }));

                    socket.emit("chat-history", chatHistory);
                } catch (error) {
                    console.error("Chat history load error:", error);
                    socket.emit("chat-history", []);
                }

                io.to(
                    meetingId
                ).emit(
                    "participants",
                    users
                );


                // ------------------------------------------
                // Tell everyone who the HOST is
                // ------------------------------------------

                const hostSocketId =
                    meetingHosts.get(meetingId);

                io.to(
                    meetingId
                ).emit(
                    "host-info",
                    {
                        hostSocketId: hostSocketId
                    }
                );


                // ------------------------------------------
                // Tell existing users
                // new user joined
                // ------------------------------------------

                if (!alreadyJoined) {

                    socket.to(
                        meetingId
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
                console.log(`${email} hand raised state: ${isHandRaised} in meeting ${meetingId}`);
                io.to(meetingId).emit("user-hand-raised", {
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
                console.log(`Reaction ${emoji} from ${email} in ${meetingId}`);
                io.to(meetingId).emit("receive-reaction", {
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
                socket.to(meetingId).emit("user-media-state-changed", {
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
                console.log(`Privacy mode set to ${isPrivacyMode} in ${meetingId}`);
                io.to(meetingId).emit("privacy-mode-changed", {
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

                // Only the HOST can end the meeting
                const hostSocketId =
                    meetingHosts.get(meetingId);

                if (
                    hostSocketId &&
                    hostSocketId !== socket.id
                ) {
                    console.log(
                        `Non-host ${socket.id} tried to end ${meetingId} — blocked`
                    );
                    return;
                }

                console.log(
                    `HOST ended meeting ${meetingId}`
                );

                // Update database status to "ended" so no user can join again
                try {
                    await Meeting.findOneAndUpdate(
                        { meetingId: meetingId },
                        { status: "ended", endedAt: new Date() }
                    );
                    console.log(`Meeting ${meetingId} marked as ended in DB.`);
                } catch (err) {
                    console.error("DB update error on end-meeting:", err);
                }

                // Notify ALL clients in the room
                io.to(meetingId).emit(
                    "meeting-ended-by-host"
                );

                // Force-disconnect every socket in room
                const roomSockets =
                    await io.in(meetingId).fetchSockets();

                for (const s of roomSockets) {
                    s.leave(meetingId);
                }

                // Clean up server state
                meetingUsers.delete(meetingId);
                meetingHosts.delete(meetingId);
            }
        );


        // ==========================================
        // LIVE SUBTITLES
        // ==========================================

        socket.on("send-subtitle", async ({ meetingId, text, timestamp }) => {
            const cleanText = typeof text === "string" ? text.trim() : "";
            const usersInMeeting = meetingUsers.get(meetingId);
            const sender = usersInMeeting && usersInMeeting.find((user) => user.socketId === socket.id);
            if (!sender || !cleanText || cleanText.length > 500) return;

            const spokenAt = timestamp ? new Date(timestamp) : new Date();
            if (Number.isNaN(spokenAt.getTime())) return;

            try {
                await Subtitle.create({
                    meetingId,
                    userId: socket.user.id,
                    email: sender.email,
                    text: cleanText,
                    spokenAt
                });
                await User.findByIdAndUpdate(socket.user.id, {
                    $push: { subtitleHistory: { meetingId, text: cleanText, spokenAt } }
                });
                io.to(meetingId).emit("subtitle", {
                    meetingId,
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
                    !meetingId ||
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

                const users =
                    meetingUsers.get(
                        meetingId
                    );


                if (!users) {

                    console.log(
                        "Meeting not found:",
                        meetingId
                    );

                    return;

                }


                // ------------------------------------------
                // Check sender
                // ------------------------------------------

                const sender =
                    users.find(
                        user =>
                            user.socketId ===
                            socket.id
                    );


                // Create chat message
                if (!sender) {
                    console.log("Rejected chat from a socket outside the meeting:", socket.id);
                    return;
                }

                const senderEmail = sender.email;
                const cleanMessage = message.trim();
                const messageId = id || `${Date.now()}-${socket.id}`;
                const sentAt = timestamp ? new Date(timestamp) : new Date();

                if (Number.isNaN(sentAt.getTime())) {
                    return;
                }

                try {
                    const encrypted = encryptChatMessage(cleanMessage);
                    await ChatMessage.create({
                        meetingId,
                        messageId,
                        senderEmail,
                        ...encrypted,
                        sentAt
                    });
                } catch (error) {
                    console.error("Chat message save error:", error);
                    socket.emit("chat-save-error", { message: "Message could not be saved" });
                    return;
                }

                const chatMessage = {
                    id: messageId,
                    meetingId: meetingId,
                    email: senderEmail,
                    message: cleanMessage,
                    timestamp: sentAt.toISOString()
                };

                // Broadcast message to EVERYONE in the meeting room
                io.to(meetingId).emit("receive-message", chatMessage);


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
                const disconnectedUser = users.find((user) => user.socketId === socket.id);
                if (!disconnectedUser) continue;

                const updatedUsers = users.filter((user) => user.socketId !== socket.id);

                try {
                    const leftAt = new Date();
                    await MeetingAttendance.findOneAndUpdate(
                        { meetingId, email: disconnectedUser.email, leftAt: null },
                        { leftAt },
                        { sort: { joinedAt: -1 } }
                    );
                    await User.findOneAndUpdate(
                        { _id: socket.user.id, "meetingHistory.meetingId": meetingId, "meetingHistory.leftAt": null },
                        { $set: { "meetingHistory.$.leftAt": leftAt } },
                        { sort: { "meetingHistory.joinedAt": -1 } }
                    );
                } catch (error) {
                    console.error("Attendance close error:", error);
                }

                if (updatedUsers.length === 0) {
                    meetingUsers.delete(meetingId);
                    meetingHosts.delete(meetingId);
                    console.log(`Meeting ${meetingId} is now empty`);
                } else {
                    meetingUsers.set(meetingId, updatedUsers);
                    io.to(meetingId).emit("participants", updatedUsers);
                    io.to(meetingId).emit("user-left", { socketId: socket.id });
                }
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

            // ------------------------------------------
            // Database
            // ------------------------------------------

            await connectDb();


            // ------------------------------------------
            // Start HTTP + Socket.IO server
            // ------------------------------------------

            httpServer.listen(
                port,
                () => {

                    console.log(
                        `Server running on port ${port}`
                    );

                }
            );


        } catch (error) {

            console.error(
                "Server connection error:",
                error
            );

        }

    };


startServer();