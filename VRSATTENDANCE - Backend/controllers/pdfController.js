const emailService = require("../services/emailService");

const sendFile = async (req, res) => {
  try {
    const { email, subject, name, message } = req.body;
    const file = req.file;

    if (!email || !file) {
      return res.status(400).json({ message: "Email and file are required" });
    }

    // Determine file type from MIME type
    const fileType = file.mimetype === "application/pdf" ? "pdf" : "csv";

    // Call email service to send the email with attachment
    await emailService.sendEmailWithAttachment(email, file, { subject, name, message, fileType });

    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error sending email", error: error.message });
  }
};

module.exports = {
  sendFile,
};
