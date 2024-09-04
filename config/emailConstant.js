require("dotenv").config()
module.exports = {
    credentials: {
        service: 'gmail',
        auth: {
            user: process.env.userEmail,
            pass: process.env.userPassword,
        }
    },
    from_email: "brainalywin@gmail.com",
}