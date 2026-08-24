const mongoose = require('mongoose'); 

const announcementSchema = new mongoose.Schema({
    sender_email : {
        type : String , 
        required : true 
    }, 
    information : {
        type : String , 
        required : true 
    }
} , { timestamps: true })

module.exports = mongoose.model("announcement" , announcementSchema); 