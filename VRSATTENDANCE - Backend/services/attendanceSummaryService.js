const moment = require('moment-timezone');
const fs = require('fs');
const path = require('path');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const nodemailer = require('nodemailer');
const ExcelJS = require('exceljs');

const formatUserList = (users) =>
  users.length > 0
    ? users.map(u => `<div>${u.name} (${u.email})</div>`).join('')
    : '<i>No users</i>';

const generateEmailTemplate = (date, punchedInUsers, notPunchedInUsers) => {
  const templatePath = path.join(__dirname, '../templates/attendance-summary.html');
  let template = fs.readFileSync(templatePath, 'utf8');

  return template
    .replace('{{date}}', date)
    .replace('{{punchedInList}}', formatUserList(punchedInUsers))
    .replace('{{notPunchedInList}}', formatUserList(notPunchedInUsers));
};

const generateExcelBuffer = async (punchedInUsers, notPunchedInUsers) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Daily Attendance');

  sheet.columns = [
    { header: 'Name', key: 'name', width: 30 },
    { header: 'Email', key: 'email', width: 40 },
    { header: 'Status', key: 'status', width: 20 },
  ];

  punchedInUsers.forEach(user =>
    sheet.addRow({ name: user.name, email: user.email, status: 'Punched In' })
  );

  notPunchedInUsers.forEach(user =>
    sheet.addRow({ name: user.name, email: user.email, status: 'Not Punched In' })
  );

  return await workbook.xlsx.writeBuffer();
};

exports.sendDailyAttendanceSummary = async () => {
  const today = moment().tz('Asia/Kolkata').format('YYYY-MM-DD');
  console.log(`📅 Running attendance summary for ${today}...`);

  try {
    const allUsers = await User.find({});
    const punchIns = await Attendance.find({ date: today, punchIn: { $ne: null } });
    const punchedInUserIds = punchIns.map(a => a.userId.toString());

    const punchedInUsers = allUsers.filter(user => punchedInUserIds.includes(user._id.toString()));
    const notPunchedInUsers = allUsers.filter(user => !punchedInUserIds.includes(user._id.toString()));

    const htmlContent = generateEmailTemplate(today, punchedInUsers, notPunchedInUsers);
    const excelAttachment = await generateExcelBuffer(punchedInUsers, notPunchedInUsers);

    const admins = await User.find({ role: { $in: [1, 2] } });
    const adminEmails = admins.map(admin => admin.email);

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      }
    });

    await transporter.sendMail({
      from: `"VRS Attendance" <${process.env.EMAIL_USER}>`,
      to: adminEmails,
      subject: `🗓️ Attendance Report - ${today}`,
      html: htmlContent,
      attachments: [{
        filename: `Attendance_Report_${today}.xlsx`,
        content: excelAttachment,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }]
    });

    console.log('📧 Daily attendance summary email sent successfully with attachment');
  } catch (error) {
    console.error('❌ Error sending daily attendance email:', error.message);
    throw error;
  }
};
