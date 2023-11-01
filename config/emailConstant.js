module.exports ={
    credentials:{
        service: "gmail",
        port: 465,
        auth: {
            user: "brainalywin@gmail.com",
            pass: "kmwbrsqghmtlsgje",
        },
        tls: {
            // do not fail on invalid certs
            rejectUnauthorized: false,
        },
    },
    from_email:"brainalywin@gmail.com",
}