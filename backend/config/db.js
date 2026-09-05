const mongoose = require('mongoose');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const getMongoUrl = () => {
    const configuredUrl = process.env.MONGO_URL || process.env.MONGO_URI;
    const mongoUrl = (configuredUrl || "mongodb://127.0.0.1:27017/g4g5_db").trim().replace(/^['"]|['"]$/g, "");

    if (!mongoUrl.startsWith("mongodb://") && !mongoUrl.startsWith("mongodb+srv://")) {
        throw new Error("MONGO_URL must start with mongodb:// or mongodb+srv://");
    }

    return mongoUrl;
};

const connectDb = async () => {
    const mongoUrl = getMongoUrl();
    const maxAttempts = Number(process.env.MONGO_CONNECT_ATTEMPTS || 5);

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            await mongoose.connect(mongoUrl, {
                serverSelectionTimeoutMS: 10000,
                connectTimeoutMS: 10000,
                socketTimeoutMS: 20000,
                maxPoolSize: 10
            });
            console.log("Database connected successfully.");

            // Drop legacy unique index on hostemail if it exists in MongoDB.
            try {
                const Meeting = require("../models/meeting");
                await Meeting.collection.dropIndex("hostemail_1");
                console.log("Successfully dropped legacy hostemail_1 unique index from MongoDB.");
            } catch (err) {
                // Index does not exist or was already dropped.
            }

            return true;
        } catch (error) {
            console.error(`MongoDB connection attempt ${attempt}/${maxAttempts} failed:`, error.message);

            if (attempt < maxAttempts) {
                await sleep(Math.min(attempt * 2000, 10000));
            }
        }
    }

    console.error("MongoDB is unavailable. Check the Atlas Network Access IP allowlist, database credentials, and Render DNS/network settings.");
    return false;
};

module.exports = connectDb; 