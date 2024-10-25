const express = require('express');
const router = express.Router();
const attendanceRegularizationController = require('../controllers/attendanceRegularizationController');
const { validateAttendance } = require('../middleware/attendanceRegularizationMiddleware');
const authenticateToken = require('../middleware/authenticateToken');

router.get('/attendances', authenticateToken, attendanceRegularizationController.getAttendanceList);
router.post('/attendances', authenticateToken, validateAttendance, attendanceRegularizationController.applyAttendanceRegularization);
router.put('/attendances/:id/status', authenticateToken, attendanceRegularizationController.updateAttendanceStatus);

module.exports = router;
