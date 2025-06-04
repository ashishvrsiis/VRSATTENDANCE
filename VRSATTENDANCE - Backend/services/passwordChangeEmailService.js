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
     try {
        console.log(`[sendNotificationEmail] Called for: ${to}, subject: ${subject}, template: ${templateName}`);

    // Define paths for different templates
    const templates = {
        'verifyEmail': path.join(__dirname, '..', 'templates', 'verifyEmail.html'),
        'forgotPassword': path.join(__dirname, '..', 'templates', 'forgotPassword.html'),
        'PasswordSuccessEmail': path.join(__dirname, '..', 'templates', 'PasswordSuccessEmail.html'),
    };

    const templatePath = templates[templateName];

    if (!templatePath) {
                    console.error(`[sendNotificationEmail] Template not found: ${templateName}`);
        throw new Error('Template not found.');
    }
        console.log(`[sendNotificationEmail] Creating transporter...`);
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    // Load the template and inject dynamic content
            console.log(`[sendNotificationEmail] Loading template from: ${templatePath}`);
    const htmlContent = loadTemplate(templatePath, replacements);

            console.log(`[sendNotificationEmail] Sending email to: ${to}...`);
    await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to,
        subject,
        html: htmlContent,  // Send the email as HTML content
        text: `Hello ${replacements.name}, here's the relevant information for your request.`,
    });
            console.log(`[sendNotificationEmail] Email sent successfully to: ${to}`);

 } catch (err) {
        console.error(`[sendNotificationEmail] Error sending to ${to}:`, err);
        throw err;
    }
};

module.exports = { sendNotificationEmail };
