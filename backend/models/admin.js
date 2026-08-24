const mongoose = require('mongoose'); 


const adminSchema = new mongoose.Schema({
    name : {
        type : String , 
        required : true 
    }, 
    email : {
        type : String , 
        required : true 
    }, 
    role : {
        type : String , 
        required : true , 
        enum : ["admin" , "superAdmin"]
    }, 
    password : {
        type : String , 
        required : true 
    }
})

module.exports = mongoose.model("admin" , adminSchema); 