require("dotenv").config()
module.exports ={
    credentials:{
        service: "ZXCS",
        auth: {
            user: process.env.userEmail,
            pass: process.env.userPassword,
        }
    },
    from_email:"brainalywin@gmail.com",
}