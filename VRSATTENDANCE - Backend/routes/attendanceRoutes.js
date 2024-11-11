const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const authenticateToken = require('../middleware/authenticateToken');

router.get('/today', authenticateToken, attendanceController.getTodayAttendance);
router.get('/monthly', authenticateToken, attendanceController.getMonthlyAttendance);
router.post('/mark', authenticateToken, attendanceController.markAttendance);
router.get('/history', authenticateToken, attendanceController.getAttendanceHistory);
router.get('/admin/history',authenticateToken, attendanceController.retrieveAttendanceHistory);
router.get('/attendance-report', attendanceController.getAttendanceReportPDF);

module.exports = router;
