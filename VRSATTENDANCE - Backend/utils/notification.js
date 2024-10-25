const nodemailer = require('nodemailer');
require('dotenv').config(); // Ensure this is called to load the .env file

console.log('Email User:', process.env.EMAIL_USER);
console.log('Email Pass:', process.env.EMAIL_PASS);

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const sendNotification = async (to, { subject, message }) => {
    try {
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to,
            subject,
            text: message
        };

        await transporter.sendMail(mailOptions);
        console.log(`Notification sent to ${to}`);
    } catch (error) {
        console.error(`Error sending notification to ${to}:`, error);
    }
};

module.exports = sendNotification;
