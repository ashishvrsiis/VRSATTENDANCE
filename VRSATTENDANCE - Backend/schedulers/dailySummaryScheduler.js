const cron = require('node-cron');
const { sendDailyAttendanceSummary } = require('../services/attendanceSummaryService');

// Runs every day at 12:00 PM IST
cron.schedule('0 12 * * *', async () => {
    await sendDailyAttendanceSummary();
});
