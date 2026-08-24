const dotenv = require("dotenv").config();
const express = require("express");
const connectDb = require("./config/db");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const adminRouter = require("./routers/admin");
const announcementRouter = require("./routers/announcement");
const userRouter = require("./routers/user");
const meetingRouter = require("./routers/meetingRouter");
const Meeting = require("./models/meeting");


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
        methods: ["GET", "POST", "PUT", "DELETE"],
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
                email
            }) => {

                console.log(
                    `${email} wants to join ${meetingId}`
                );

                // Verify meeting is not ended in database
                let meetingRecord = null;
                try {
                    meetingRecord = await Meeting.findOne({ meetingId: meetingId });
                    if (meetingRecord && meetingRecord.status === "ended") {
                        console.log(`Rejecting join for ended meeting ${meetingId}`);
                        socket.emit("meeting-ended-by-host");
                        return;
                    }
                } catch (err) {
                    console.error("DB meeting status check error:", err);
                }

                // ------------------------------------------
                // Join Socket.IO room
                // ------------------------------------------

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

                }


                console.log(
                    "Participants in meeting:",
                    users
                );


                // ------------------------------------------
                // Send participant list
                // ------------------------------------------

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
        // LIVE CHAT
        // ==========================================

        socket.on(
            "send-message",
            ({
                meetingId,
                email,
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
                    email
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
                const senderEmail = (sender && sender.email) || email || "Participant";

                const chatMessage = {
                    id: id || `${Date.now()}-${socket.id}`,
                    meetingId: meetingId,
                    email: senderEmail,
                    message: message.trim(),
                    timestamp: timestamp || new Date().toISOString()
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

        socket.on(
            "disconnect",
            () => {

                console.log(
                    "User disconnected:",
                    socket.id
                );


                // ------------------------------------------
                // Search all meetings
                // ------------------------------------------

                for (
                    const [
                        meetingId,
                        users
                    ]
                    of meetingUsers
                ) {


                    // ------------------------------------------
                    // Remove disconnected user
                    // ------------------------------------------

                    const updatedUsers =
                        users.filter(
                            user =>
                                user.socketId !==
                                socket.id
                        );


                    // ------------------------------------------
                    // Nobody left
                    // ------------------------------------------

                    if (
                        updatedUsers.length === 0
                    ) {

                        meetingUsers.delete(
                            meetingId
                        );

                        meetingHosts.delete(
                            meetingId
                        );


                        console.log(
                            `Meeting ${meetingId} is now empty`
                        );

                    }


                    // ------------------------------------------
                    // Users still present
                    // ------------------------------------------

                    else if (
                        updatedUsers.length !==
                        users.length
                    ) {

                        meetingUsers.set(
                            meetingId,
                            updatedUsers
                        );


                        console.log(
                            "Updated participants:",
                            updatedUsers
                        );


                        // ------------------------------------------
                        // Send updated participants
                        // ------------------------------------------

                        io.to(
                            meetingId
                        ).emit(
                            "participants",
                            updatedUsers
                        );


                        // ------------------------------------------
                        // Notify users
                        // someone left
                        // ------------------------------------------

                        io.to(
                            meetingId
                        ).emit(
                            "user-left",
                            {

                                socketId:
                                    socket.id

                            }
                        );

                    }

                }

            }
        );

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