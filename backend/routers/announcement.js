const express = require("express");

const users = require("../models/users");
const admin = require("../models/admin");
const announcement = require("../models/announcement");
const authMiddleware = require("../middleware/authMiddleware");

const announcementRouter = express.Router();


// ===============================
// POST - Publish Announcement
// ===============================

announcementRouter.post(
    "/publish",
    authMiddleware,
    async (req, res) => {
        try {

            const { information } = req.body;

            // Get email from JWT
            const sender_email = req.user.email;

            if (!information) {
                return res.status(400).json({
                    error: "Information is required"
                });
            }

            // Check user
            const userExist = await users.findOne({
                email: sender_email
            });

            // Check admin
            const AdminExist = await admin.findOne({
                email: sender_email
            });

            if (!AdminExist && !userExist) {
                return res.status(404).json({
                    error: "User does not exist"
                });
            }

            // Create notification
            const newNotification = new announcement({
                sender_email,
                information
            });

            await newNotification.save();

            return res.status(201).json({
                message: "Notification sent successfully"
            });

        } catch (error) {

            console.error("Publish notification error:", error);

            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
);


// ===============================
// GET - All Announcements
// ===============================

announcementRouter.get(
    "/all",
    authMiddleware,
    async (req, res) => {

        try {

            const allNotification = await announcement.find();

            return res.status(200).json({
                message: "Notifications fetched successfully",
                notifications: allNotification
            });

        } catch (error) {

            console.error("Get notifications error:", error);

            return res.status(500).json({
                error: "Internal server error"
            });
        }
    }
);


module.exports = announcementRouter;