const express = require('express');
const router = express.Router();
const { forgotPassword, verifyOtp, sendOtp, verifyOtpAndChangePassword } = require('../controllers/passwordController');

router.post('/forgot', forgotPassword);
router.post('/change-password', sendOtp);
router.post('/verify-otp-and-change-password', verifyOtpAndChangePassword);

module.exports = router;
