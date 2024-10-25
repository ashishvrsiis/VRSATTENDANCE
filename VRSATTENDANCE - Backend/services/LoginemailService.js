const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// Function to load and customize the HTML template
const loadTemplate = (filePath, replacements) => {
    try {
        console.log('Reading email template from:', filePath);
        let template = fs.readFileSync(filePath, { encoding: 'utf-8' });
        
        // Replace placeholders with actual values
        for (const [key, value] of Object.entries(replacements)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            template = template.replace(regex, value || '');
        }
        
        console.log('Template loaded and customized successfully');
        return template;
    } catch (error) {
        console.error('Error loading or customizing template:', error);
        throw error;
    }
};

exports.sendEmail = async (to, { subject, name, message, otp, link, email, buttonText }) => {
    console.log('Preparing to send email to:', to);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    const templatePath = path.join('C:', 'Users', 'ashis', 'OneDrive', 'Desktop', 'Work', 'VRSATTENDANCE - Backend', 'templates', 'LoginEmailTemplate.html');

    // Load and customize the HTML template
    let htmlContent;
    try {
        htmlContent = loadTemplate(templatePath, { subject, name, message, otp, link, email, buttonText });
    } catch (error) {
        console.error('Error preparing HTML content:', error);
        return { error: 'Error preparing email content' };
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject,
        html: htmlContent,
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info);
    } catch (error) {
        console.error('Error sending email:', error);
        throw new Error('Could not send OTP email.');
    }
};
