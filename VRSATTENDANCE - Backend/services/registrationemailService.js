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
        'accountApproved': path.join(__dirname, '..', 'templates', 'accountApproved.html'),
        'accountRejected': path.join(__dirname, '..', 'templates', 'accountRejected.html'),
    };

    const templatePath = templates[templateName];

    if (!templatePath) {
        throw new Error('Template not found.');
    }

    console.log(`Sending email to: ${to}`);
    console.log(`Using template: ${templatePath}`);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    try {
        // Load the template and inject dynamic content
        const htmlContent = loadTemplate(templatePath, replacements);

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to,
            subject,
            html: htmlContent,  // Send the email as HTML content
            text: `Hello ${replacements.name}, your account status has been updated.`, // Plain text fallback
        });

        console.log(`Email sent to ${to} with subject "${subject}"`);
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

module.exports = { sendNotificationEmail };
