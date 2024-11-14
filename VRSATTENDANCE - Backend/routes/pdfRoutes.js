const express = require('express');
const multer = require('multer');
const { sendEmailWithPDF } = require('../services/emailService');

const router = express.Router();

// Configure multer to handle PDF file uploads
const upload = multer();

router.post('/send-email', upload.single('pdfFile'), async (req, res) => {
    const { email, subject, name, message } = req.body;
    const pdfFile = req.file; // multer handles the file as `req.file`

    try {
        const result = await sendEmailWithPDF(email, pdfFile, { subject, name, message });
        res.status(200).json({ success: true, result });
    } catch (error) {
        console.error('Error in email sending route:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
