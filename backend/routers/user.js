const express = require('express');
const users = require('../models/users');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware');

const userRouter = express.Router();

// User Registration
userRouter.post("/register", async (req, res) => {
    try {
        const { name, email, phone, password } = req.body;

        if (!name || !email || !phone || !password) {
            return res.status(400).json({
                error: "All fields are required"
            });
        }

        const userExist = await users.findOne({ email });

        if (userExist) {
            return res.status(400).json({
                error: "Email already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = new users({
            name,
            email,
            phone,
            password: hashedPassword
        });

        await newUser.save();

        return res.status(201).json({
            message: "User registered successfully"
        });

    } catch (error) {
        console.error("User register error:", error);
        return res.status(500).json({
            error: "Internal server error"
        });
    }
});

// User Login
userRouter.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "All fields are required"
            });
        }

        const checkUser = await users.findOne({ email });

        if (!checkUser) {
            return res.status(400).json({
                error: "Email not found"
            });
        }

        const checkPassword = await bcrypt.compare(password, checkUser.password);

        if (!checkPassword) {
            return res.status(400).json({
                error: "Wrong email or password"
            });
        }

        const jwtSecret = process.env.JWT_SECRET || "default_jwt_secret_key_123";

        const token = jwt.sign(
            {
                id: checkUser._id,
                email: checkUser.email,
                name: checkUser.name,
                role: "user"
            },
            jwtSecret,
            {
                expiresIn: "24h"
            }
        );

        return res.status(200).json({
            message: "User login successfully",
            token,
            user: {
                name: checkUser.name,
                email: checkUser.email,
                phone: checkUser.phone
            }
        });

    } catch (error) {
        console.error("User login error:", error);
        return res.status(500).json({
            error: "Internal server error"
        });
    }
});

// Get Current User Profile
userRouter.get("/me", authMiddleware, async (req, res) => {
    try {
        const user = await users.findOne({ email: req.user.email }).select("-password");
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        return res.status(200).json({ user });
    } catch (error) {
        return res.status(500).json({ error: "Internal server error" });
    }
});

// Get All Registered Users (for meeting invite selection)
userRouter.get("/all", authMiddleware, async (req, res) => {
    try {
        const allUsers = await users.find({}, "name email").lean();
        return res.status(200).json({ users: allUsers });
    } catch (error) {
        console.error("Get all users error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

module.exports = userRouter; 