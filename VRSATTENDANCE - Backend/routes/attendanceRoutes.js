const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const authenticateToken = require('../middleware/authenticateToken');

router.get('/today', authenticateToken, attendanceController.getTodayAttendance);
router.get('/monthly', authenticateToken, attendanceController.getMonthlyAttendance);
router.get('/weekly', authenticateToken, attendanceController.getWeeklyAttendance);
router.post('/mark', authenticateToken, attendanceController.markAttendance);
router.get('/history', authenticateToken, attendanceController.getAttendanceHistory);
router.get('/admin/history',authenticateToken, attendanceController.retrieveAttendanceHistory);
router.get('/attendance-report', authenticateToken, attendanceController.getAttendanceReportPDF);
router.get('/excel/attendance-report', authenticateToken, attendanceController.getAttendanceReportExcel);
router.get('/CurrentUser/pdf/attendance-report', authenticateToken, attendanceController.getCurrentUserAttendanceHistoryPDF);
router.get('/CurrentUser/excel/attendance-report', authenticateToken, attendanceController.getCurrentUserAttendanceHistoryExcel);
router.get('/user/:userId/excel/attendance-report', authenticateToken, attendanceController.getUserAttendanceHistoryExcel);
router.get('/user/:userId/pdf/attendance-report', authenticateToken, attendanceController.getUserAttendanceHistoryPDF);
router.get('/history/all-users', attendanceController.getAllUsersAttendanceHistory);
router.get('/UserTags/pdf/attendance-report', authenticateToken, attendanceController.generateUserTagsAttendanceHistoryPDF);
router.get('/UserTags/excel/attendance-report', authenticateToken, attendanceController.generateUserTagsAttendanceHistoryExcel);
router.get('/pdf/generate-report-by-plaza', authenticateToken, attendanceController.generateAttendanceReportByPlaza);
router.get('/excel/generate-report-by-plaza', authenticateToken, attendanceController.generatePlazaAttendanceHistoryExcel);
router.get('/pdf/download-summary', authenticateToken, attendanceController.generateAllUsersAttendanceSummaryPDF);
router.get('/excel/download-summary', authenticateToken, attendanceController.generateAllUsersAttendanceSummaryExcel);
router.get('/pdf/generate-user-tags-summary', authenticateToken, attendanceController.generateUserTagsAttendanceSummaryPDF);
router.get('/excel/generate-user-tags-summary', authenticateToken, attendanceController.generateUserTagsAttendanceSummaryExcel);
router.get('/pdf/generate-plaza-name-summary', authenticateToken, attendanceController.generateAttendanceReportSummaryByPlaza);
router.get('/excel/generate-plaza-name-summary', authenticateToken, attendanceController.generateAttendanceReportSummaryByPlazaExcel);




module.exports = router;
