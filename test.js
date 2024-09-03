const nodemailer = require('nodemailer');

// Create a transporter object using the default SMTP transport
let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: 'amstaxiholland@gmail.com', // Your Gmail address
      pass: 'tbux atzt lvny lmdc' // Your Gmail password or app-specific password
    }
  });

// Setup email data
let mailOptions = {
    from: '"Idishpatch" amstaxiholland@gmail.com', // Sender address
    to: 'anil@codenomad.net', // List of receivers
    subject: 'Hello ✔', // Subject line
    text: 'Hello world?', // Plain text body
    html: '<b>Hello world?</b>' // HTML body
};

// Send mail with defined transport object
transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
        return console.log(error);
    }
    console.log('Message sent: %s', info.messageId);
    console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
});