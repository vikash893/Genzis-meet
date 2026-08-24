const mongoose = require('mongoose'); 

const connectDb = async () => {
    try {
        const mongoUrl = process.env.MONGO_URL || "mongodb://127.0.0.1:27017/g4g5_db";
        await mongoose.connect(mongoUrl);
        console.log('Database connected successfully:', mongoUrl);

        // Drop legacy unique index on hostemail if it exists in MongoDB
        try {
            const Meeting = require("../models/meeting");
            await Meeting.collection.dropIndex("hostemail_1");
            console.log("Successfully dropped legacy hostemail_1 unique index from MongoDB.");
        } catch (err) {
            // Index doesn't exist or already dropped, ignore
        }
    } catch (error) {
        console.error("MongoDB connection error:", error.message); 
    }
}

module.exports = connectDb; 