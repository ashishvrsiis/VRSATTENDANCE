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

// Function to send an email with a PDF attachment
const sendEmailWithPDF = async (to, pdfFile, { subject, name, message }) => {
    console.log('Preparing to send email with PDF to:', to);

    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
        },
    });

    // Define the template path for the email with PDF (if you have a custom HTML template)
    const templatePath = path.join(__dirname, '..', 'templates', 'PDFEmailTemplate.html');

    // Load and customize the HTML template
    let htmlContent;
    try {
        htmlContent = loadTemplate(templatePath, { subject, name, message });
    } catch (error) {
        console.error('Error preparing HTML content:', error);
        return { error: 'Error preparing email content' };
    }

    const mailOptions = {
        from: process.env.EMAIL_USER,
        to,
        subject: subject || 'Your PDF Document',
        html: htmlContent,
        attachments: [
            {
                filename: 'document.pdf',
                content: pdfFile.buffer,
                contentType: 'application/pdf',
            },
        ],
    };

    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email with PDF sent successfully. Info:', info);
        return info;
    } catch (error) {
        console.error('Error sending email with PDF:', error);
        throw new Error('Could not send email with PDF.');
    }
};

module.exports = {
    sendEmailWithPDF,
};
