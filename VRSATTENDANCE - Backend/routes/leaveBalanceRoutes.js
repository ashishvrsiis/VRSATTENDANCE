// routes/leaveBalanceRoutes.js
const express = require('express');
const router = express.Router();
const leaveBalanceController = require('../controllers/leaveBalanceController');
const leaveBalanceMiddleware = require('../middleware/leaveBalanceMiddleware');
const authenticateToken = require('../middleware/authenticateToken'); // Assuming you have this middleware for authentication

router.get('/balance', authenticateToken, leaveBalanceController.getLeaveBalance);
router.put('/balance', authenticateToken, leaveBalanceMiddleware.validateLeaveBalanceUpdate, leaveBalanceController.updateLeaveBalance);

module.exports = router;
