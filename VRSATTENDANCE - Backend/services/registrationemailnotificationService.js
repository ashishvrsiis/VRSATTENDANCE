const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Path to the registration request email template
const templatePath = path.join(__dirname, '..', 'templates', 'registrationRequest.html');

// Function to load the HTML template and replace placeholders
const loadTemplate = (filePath, replacements) => {
    let template = fs.readFileSync(filePath, { encoding: 'utf-8' });
    for (const key in replacements) {
        template = template.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
    }
    return template;
};

// Function to send email with dynamic data
const sendRegistrationEmail = async (to, { subject, replacements }) => {
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
        text: `New registration request from ${replacements.name}. Please review the details.`, // Plain text fallback
    });
};

// Export the function for use in other parts of the application
module.exports = { sendRegistrationEmail };
