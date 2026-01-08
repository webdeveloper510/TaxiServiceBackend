require("dotenv").config()


const mongoose = require('mongoose')

const dbUrl = process.env.DATABASE_URL


const connection = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000, 
    socketTimeoutMS: 20000,
}

 mongoose
    .connect(dbUrl, connection)
    .then((res) => {
        console.info('Connected to db')
    })
    .catch((e) => {
        
        console.log('❌❌❌❌❌❌❌❌❌  Unable to connect to the db', e)
        process.exit(1);
    })