const attendanceSummaryService = require('../services/attendanceSummaryService');

exports.triggerAttendanceSummaryEmail = async (req, res) => {
  try {
    await attendanceSummaryService.sendDailyAttendanceSummary();
    res.status(200).json({ message: 'Attendance summary email sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to send attendance summary email', error: error.message });
  }
};
