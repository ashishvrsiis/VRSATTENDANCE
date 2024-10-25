const passwordService = require('../services/passwordService');

const forgotPassword = async (req, res) => {
    try {
        const { email, newPassword, otp } = req.body;
        const message = await passwordService.forgotPassword(email, newPassword, otp);
        res.status(200).json({ message });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { email, otp, new_password } = req.body;
        await passwordService.verifyOtp(email, otp, new_password);
        res.status(200).json({ message: 'Password successfully changed.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const sendOtp = async (req, res) => {
    try {
        const { email } = req.body;
        await passwordService.sendOtp(email);
        res.status(200).json({ message: 'OTP sent to your email address.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const verifyOtpAndChangePassword = async (req, res) => {
    try {
        const { email, otp, new_password } = req.body;
        await passwordService.verifyOtpAndChangePassword(email, otp, new_password);
        res.status(200).json({ message: 'Password successfully changed.' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = {
    forgotPassword,
    verifyOtp,
    sendOtp,
    verifyOtpAndChangePassword
};
