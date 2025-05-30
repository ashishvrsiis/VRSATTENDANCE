const express = require('express');
const authController = require('../controllers/authController');
const authenticateToken = require('../middleware/authenticateToken');
const router = express.Router();

router.post('/register', authenticateToken, authController.register);
router.post('/token', authController.login);
router.get('/pending-registrations', authenticateToken, authController.getPendingRegistrations);

// Route to approve registration - only for admins
router.post('/approve-registration/:id', authenticateToken, authController.approveRegistration);

// Route to reject registration - only for admins
router.post('/reject-registration/:id', authenticateToken, authController.rejectRegistration);

router.post('/request-otp', authController.requestOtp); // New route to request OTP
router.post('/verify-otp', authController.verifyOtp);   // New route to verify OTP
router.post('/verifyLoginOtp', authController.verifyLoginOtp);
router.post('/toggle-otp', authenticateToken, authController.toggleOtp); // Protected route to toggle OTP
router.post('/block', authenticateToken, authController.blockUser);
router.post('/unblock', authenticateToken, authController.unblockUser);

module.exports = router;
