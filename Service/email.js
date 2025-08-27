const nodemailer = require("nodemailer");
const emailConstant = require("../config/emailConstant");
var path = require("path");
const ejs = require("ejs");
const sendGrid = require('@sendgrid/mail');
const juice = require('juice');
const { htmlToText } = require('html-to-text');
const key = (process.env.SEND_GRID_EMAIL_API_KEY || '').trim(); // <- trim
if (!key || !key.startsWith('SG.')) throw new Error('Bad/missing SEND_GRID_EMAIL_API_KEY');
sendGrid.setApiKey(key);


// Configure your email transport
const transporter = nodemailer.createTransport(emailConstant.credentials);

async function sendEmail(to, subject, templateName, data, language = "nl" ,attachments) {
    try {
        // Path to the EJS file
        const templatePath = path.join(__dirname, "..", "templates", language,  `${templateName}.ejs`);

        // Render the EJS template with dynamic data
        const htmlContent = await ejs.renderFile(templatePath, data);

        // Email options
        const mailOptions = {
            from: emailConstant.from_email,
            to,
            subject,
            html: htmlContent
        };

        // Add attachments only if they exist
        if (attachments && attachments.length > 0) {
            mailOptions.attachments = attachments;
        }
        console.log('process.env.SEND_GRID_EMAIL_API_KEY---------' , process.env.SEND_GRID_EMAIL_API_KEY)
        console.log('process.env.NO_REPLY_EMAIL---------' , process.env.NO_REPLY_EMAIL)
        console.log('process.env.NO_REPLY_EMAIL_USERNAME---------' , process.env.NO_REPLY_EMAIL_USERNAME)
        // Send email
        // 1) Inline CSS
        const htmlInlined = juice(htmlContent);

        // 2) Plain-text fallback
        const textFallback = htmlToText(htmlInlined, { wordwrap: 120 });
        const info =     sendGrid.send({
                                                to: to,
                                                from: { email: process.env.NO_REPLY_EMAIL, name: process.env.NO_REPLY_EMAIL_USERNAME },
                                                subject: subject,
                                                html: htmlInlined,
                                                text: textFallback,
                                            }).then(() => console.log('Sent ✅'))
  .catch(e => console.error(e.response?.statusCode, e.response?.body || e))
        // const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: " + info.response);
        return info
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

module.exports = sendEmail;