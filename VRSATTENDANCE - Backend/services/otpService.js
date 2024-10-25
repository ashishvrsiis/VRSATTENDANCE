const crypto = require('crypto');
const otpStore = {}; // Temporary store for OTPs; consider using a database or cache like Redis in production

exports.generateOtp = (email) => {
    const otp = crypto.randomInt(100000, 999999).toString(); // Generate a 6-digit OTP
    otpStore[email] = { otp, expiresAt: Date.now() + 10 * 60 * 1000 }; // Expires in 10 minutes
    return otp;
};

exports.verifyOtp = (email, otp) => {
    const record = otpStore[email];
    if (!record) {
        throw new Error('OTP not found or expired');
    }
    if (record.otp !== otp) {
        throw new Error('Invalid OTP');
    }
    if (Date.now() > record.expiresAt) {
        delete otpStore[email];
        throw new Error('OTP has expired');
    }
    delete otpStore[email]; // Remove OTP after successful verification
    return true;
};
