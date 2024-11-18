const express = require('express');
const multer = require('multer');
const { sendEmailWithAttachment } = require('../services/emailService');

const router = express.Router();

// Configure multer to handle PDF file uploads
const upload = multer();

router.post('/send-email', upload.single('pdfFile'), async (req, res) => {
    const { email, subject, name, message } = req.body;
    const file = req.file;

    // Ensure the file exists
    if (!file) {
        return res.status(400).json({ success: false, message: 'File is required' });
    }

    try {
        // Determine file type
        const fileType = file.mimetype === "application/pdf" ? "pdf" : file.mimetype === "text/csv" ? "csv" : null;

        if (!fileType) {
            return res.status(400).json({ success: false, message: 'Unsupported file type' });
        }

        const result = await sendEmailWithAttachment(email, file, { subject, name, message, fileType });
        res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Error in email sending route:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
