const express = require('express');
const router = express.Router();
const controller = require('../controllers/attendanceSummaryController');
const authenticateToken = require('../middleware/authenticateToken');

router.post('/send-daily-summary', authenticateToken, controller.triggerAttendanceSummaryEmail);

module.exports = router;
