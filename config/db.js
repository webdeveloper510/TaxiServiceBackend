require("dotenv").config()


const mongoose = require('mongoose')

const dbUrl = process.env.DATABASE_URL


const connection = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}

mongoose
    .connect(dbUrl, connection)
    .then((res) => {
        console.info('Connected to db')
    })
    .catch((e) => {
        console.log('Unable to connect to the db', e)
    })