const emailService = require("../services/emailService");

const sendPDF = async (req, res) => {
  try {
    const { email } = req.body;
    const pdfFile = req.file;

    if (!email || !pdfFile) {
      return res.status(400).json({ message: "Email and PDF file are required" });
    }

    // Call email service to send the email with attachment
    await emailService.sendEmailWithPDF(email, pdfFile);

    res.status(200).json({ message: "Email sent successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error sending email", error: error.message });
  }
};

module.exports = {
  sendPDF,
};
