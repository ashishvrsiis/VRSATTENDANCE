const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Function to load and customize the HTML template
const loadTemplate = (filePath, replacements) => {
    let template = fs.readFileSync(filePath, { encoding: 'utf-8' });

    // Replace placeholders with actual values
    for (const [key, value] of Object.entries(replacements)) {
        const regex = new RegExp(`{{${key}}}`, 'g');
        template = template.replace(regex, value || '');
    }

    return template;
};

exports.sendEmail = async (to, { subject, name, message, otp, link,email, buttonText }) => {
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    // Path to the email template file
    const templatePath = path.join('C:', 'Users', 'ashis', 'OneDrive', 'Desktop', 'Work', 'VRSATTENDANCE - Backend', 'templates', 'LoginEmailTemplate.html');

    // Load and customize the HTML template
    const htmlContent = loadTemplate(templatePath, {
        subject,
        name,
        message,
        otp,
        link,
        email,
        buttonText
    });

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html: htmlContent, // Use the customized HTML content
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
    }
};
