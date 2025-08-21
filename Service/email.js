const nodemailer = require("nodemailer");
const emailConstant = require("../config/emailConstant");
var path = require("path");
const ejs = require("ejs");

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

        // Send email
        const info = await transporter.sendMail(mailOptions);
        console.log("Email sent: " + info.response);
        return info
    } catch (error) {
        console.error("Error sending email:", error);
    }
}

module.exports = sendEmail;