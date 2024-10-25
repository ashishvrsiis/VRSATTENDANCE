const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Function to load the HTML template and replace placeholders
const loadTemplate = (filePath, replacements) => {
    let template = fs.readFileSync(filePath, { encoding: 'utf-8' });
    for (const key in replacements) {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
    }
    return template;
};

// Function to send email with dynamic data
const sendNotificationEmail = async (to, { subject, templateName, replacements }) => {
    // Define paths for different templates
    const templates = {
        'verifyEmail': path.join('C:', 'Users', 'ashis', 'OneDrive', 'Desktop', 'Work', 'VRSATTENDANCE - Backend', 'templates', 'verifyEmail.html'),
        'forgotPassword': path.join('C:', 'Users', 'ashis', 'OneDrive', 'Desktop', 'Work', 'VRSATTENDANCE - Backend', 'templates', 'forgotPassword.html'),
        'PasswordSuccessEmail': path.join('C:', 'Users', 'ashis', 'OneDrive', 'Desktop', 'Work', 'VRSATTENDANCE - Backend', 'templates', 'PasswordSuccessEmail.html'),
    };

    const templatePath = templates[templateName];

    if (!templatePath) {
        throw new Error('Template not found.');
    }

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    // Load the template and inject dynamic content
    const htmlContent = loadTemplate(templatePath, replacements);

    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html: htmlContent,  // Send the email as HTML content
        text: `Hello ${replacements.name}, here's the relevant information for your request.`,
    });
};

module.exports = { sendNotificationEmail };
