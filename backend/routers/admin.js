const express = require('express'); 
const users = require('../models/users');
const bcrypt = require('bcryptjs'); 
const admin = require('../models/admin');
const jwt = require('jsonwebtoken'); 


const adminRouter = express.Router(); 

adminRouter.post("/Register-user" , async(req , res) => {
    try {
        const {name , email , phone , password} = req.body ; 

        if (!name || !email || !phone || !password){
            return res.status(400).json({
                error : "All fields are required"
            })
        }

        const userExist = await users.findOne({email}); 

        if (userExist){
            return res.status(400).json({
                error : "Email already exist"
            })
        }

        const hashedPassword = await bcrypt.hash(password , 10); 


        const newUser = new users({
            name , 
            phone , 
            email , 
            password : hashedPassword
        })

        await newUser.save(); 

        res.status(200).json({
            message : "User register sucessfully"
        })
        
    } catch (error) {
        res.status(500).json({
            error : "Internal server error"
        })
    }
})


adminRouter.post("/create-admin" , async(req , res) => {
    try {
        const {name , email ,  role , password} = req.body ; 

        if (!name || !email || !role || !password){
            return res.status(400).json({
                error : "All feilds are required"
            })
        }

        const adminExist = await admin.findOne({email}); 

        if (adminExist){
            return res.status(400).json({
                error : "Email Already exist"
            })
        }

        const hashedPassword = await bcrypt.hash(password , 10); 

        const newAdmin = new admin({
            name , 
            email , 
            role ,
            password : hashedPassword
        })

        await newAdmin.save(); 

        return res.status(200).json({
            message : "Admin register Sucessfully"
        })
    } catch (error) {
        return res.status(500).json({
            error : "Internal server error"
        })
    }
})


adminRouter.post("/admin-login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                error: "All fields are required"
            });
        }

        const checkAdmin = await admin.findOne({ email });

        if (!checkAdmin) {
            return res.status(400).json({
                error: "Wrong email or password"
            });
        }

        const comparePassword = await bcrypt.compare(
            password,
            checkAdmin.password
        );

        if (!comparePassword) {
            return res.status(400).json({
                error: "Wrong email or password"
            });
        }

        const token = jwt.sign(
            {
                email: checkAdmin.email,
                role: checkAdmin.role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1h"
            }
        );

        return res.status(200).json({
            message: "Login successfully",
            token
        });

    } catch (error) {
        console.error("Admin login error:", error);

        return res.status(500).json({
            error: "Internal server error"
        });
    }
});


// Comprehensive User Analytics (Total meetings, meetings hosted, meetings attended)
adminRouter.get("/user-analytics", async (req, res) => {
    try {
        const Meeting = require("../models/meeting");
        const allUsers = await users.find({}, "-password");
        const allMeetings = await Meeting.find({});

        const userStats = allUsers.map((user) => {
            const hostedCount = allMeetings.filter(m => m.hostemail === user.email).length;
            const activeHostedCount = allMeetings.filter(m => m.hostemail === user.email && m.status === "active").length;
            const endedHostedCount = allMeetings.filter(m => m.hostemail === user.email && m.status === "ended").length;

            return {
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                registeredAt: user.createdAt,
                totalMeetingsHosted: hostedCount,
                activeMeetingsHosted: activeHostedCount,
                endedMeetingsHosted: endedHostedCount
            };
        });

        return res.status(200).json({
            totalUsers: allUsers.length,
            totalMeetingsInSystem: allMeetings.length,
            activeMeetingsCount: allMeetings.filter(m => m.status === "active").length,
            endedMeetingsCount: allMeetings.filter(m => m.status === "ended").length,
            users: userStats
        });

    } catch (error) {
        console.error("User analytics error:", error);
        return res.status(500).json({ error: "Failed to calculate user analytics" });
    }
});

module.exports = adminRouter; 