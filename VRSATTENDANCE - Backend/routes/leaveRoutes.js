const express = require('express');
const leaveController = require('../controllers/leaveController');
const authMiddleware = require('../middleware/authenticateToken');

const router = express.Router();

// Apply for leave
router.post('/leave', authMiddleware, leaveController.createLeave);

// Get leave requests for an employee
router.get('/leave', authMiddleware, leaveController.getLeaveRequests);

// Approve leave
router.patch('/leave/:leaveId/approve', authMiddleware, leaveController.approveLeave);

//Reject leave
router.patch('/leave/:leaveId/reject', authMiddleware, leaveController.rejectLeave);


module.exports = router;