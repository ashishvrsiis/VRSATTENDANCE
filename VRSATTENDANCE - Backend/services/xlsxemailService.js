const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

// Function to load and customize the HTML template
const loadTemplate = (filePath, replacements) => {
  try {
    console.log("Reading email template from:", filePath);
    let template = fs.readFileSync(filePath, { encoding: "utf-8" });

    // Replace placeholders with actual values
    for (const [key, value] of Object.entries(replacements)) {
      const regex = new RegExp(`{{${key}}}`, "g");
      template = template.replace(regex, value || "");
    }

    console.log("Template loaded and customized successfully");
    return template;
  } catch (error) {
    console.error("Error loading or customizing template:", error);
    throw error;
  }
};

// Function to send an email with an attachment
const sendxlsxEmailWithAttachment = async (to, file, { subject, name, message, fileType }) => {
  if (!fileType) {
    throw new Error("File type is required");
  }

  console.log(`Preparing to send email with ${fileType.toUpperCase()} to:`, to);

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  // Use an XLSX-specific template for emails
  const templatePath = path.join(__dirname, "..", "templates", "XLSXEmailTemplate.html");

  let htmlContent;
  try {
    htmlContent = loadTemplate(templatePath, { subject, name, message });
  } catch (error) {
    console.error("Error preparing HTML content:", error);
    throw new Error("Error preparing email content");
  }

  const mimeType = fileType === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/plain";
  const fileExtension = fileType;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: subject || `Your ${fileType.toUpperCase()} Document`,
    html: htmlContent,
    attachments: [
      {
        filename: `Attendance_History_Report.${fileExtension}`,
        content: file.buffer,
        contentType: mimeType,
      },
    ],
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`Email with ${fileType.toUpperCase()} sent successfully. Info:`, info);
    return info;
  } catch (error) {
    console.error(`Error sending email with ${fileType.toUpperCase()}:`, error);
    throw new Error(`Could not send email with ${fileType.toUpperCase()}.`);
  }
};

module.exports = {
    sendxlsxEmailWithAttachment,
};
