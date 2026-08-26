const mongoose = require('mongoose'); 

const userSchema = new mongoose.Schema({
    name : {
        type : String , 
        required : true 
    }, 
    email : {
        type : String , 
        required : true 
    }, 
    phone : {
        type : String , 
        required : true 
    },
    password : {
        type : String , 
        required : true 
    },
    meetingHistory: {
        type: [{
            meetingId: { type: String, required: true },
            title: { type: String, default: "Untitled meeting" },
            joinedAt: { type: Date, required: true },
            leftAt: { type: Date, default: null }
        }],
        default: []
    },
    subtitleHistory: {
        type: [{
            meetingId: { type: String, required: true },
            text: { type: String, required: true },
            spokenAt: { type: Date, required: true }
        }],
        default: []
    }
})

module.exports = mongoose.model("user" , userSchema); 