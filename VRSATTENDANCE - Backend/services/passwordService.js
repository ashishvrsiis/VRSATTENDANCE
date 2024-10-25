const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const { sendNotificationEmail } = require('./passwordChangeEmailService');

// Config for nodemailer
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const generateOtp = () => {
    return crypto.randomInt(100000, 999999).toString();
};

const sendOtp = async (email) => {
    try {
        const otp = generateOtp();
        const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

        // Find user by email
        const user = await User.findOne({ email });
        if (!user) throw new Error('User not found');

        // Update user with OTP and expiration
        user.otp = otp;
        user.otpExpires = expiration;
        await user.save();

        // Send OTP email for forgot password
        await sendNotificationEmail(user.email, {
            subject: 'Password Reset Request',  // Set subject here
            templateName: 'forgotPassword',     // Specify the correct template
            replacements: { name: user.name, otp: otp }
        });

        return 'OTP sent to your email address.';
    } catch (error) {
        throw new Error(`Error sending OTP: ${error.message}`);
    }
};

const verifyOtp = async (email, otp) => {
    try {
        const user = await User.findOne({ email });
        if (!user) throw new Error('User not found');

        // Check if OTP matches and is not expired
        if (user.otp !== otp || user.otpExpires < Date.now()) {
            throw new Error('Invalid or expired OTP');
        }

        // Clear OTP fields after successful verification
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        // Send verification success email
        await sendNotificationEmail(user.email, {
            subject: 'Email Verified Successfully',
            templateName: 'verifyEmail',  // Correct template for verifying email
            replacements: { name: user.name }
        });

        return 'OTP verified successfully.';
    } catch (error) {
        throw new Error(`Error verifying OTP: ${error.message}`);
    }
};

const verifyOtpAndChangePassword = async (email, otp, newPassword) => {
    try {
        const user = await User.findOne({ email });
        if (!user) throw new Error('User not found');

        // Check if OTP matches and is not expired
        if (user.otp !== otp || user.otpExpires < Date.now()) {
            throw new Error('Invalid or expired OTP');
        }

        // Update password
        user.password = newPassword;
        user.otp = undefined;
        user.otpExpires = undefined;
        await user.save();

        // Send change password success email
        await sendNotificationEmail(user.email, {
            subject: 'Password Changed Successfully',
            templateName: 'PasswordSuccessEmail',  // Use the correct template
            replacements: { name: user.name }
        });

        return 'Password changed successfully.';
    } catch (error) {
        throw new Error(`Error changing password: ${error.message}`);
    }
};

const forgotPassword = async (email, newPassword, otp) => {
    try {
        // If OTP and new password are provided, verify OTP and change password
        if (otp && newPassword) {
            return await verifyOtpAndChangePassword(email, otp, newPassword);
        }

        // Otherwise, generate and send OTP for forgot password
        return await sendOtp(email);
    } catch (error) {
        throw new Error(`Error handling forgot password request: ${error.message}`);
    }
};

module.exports = {
    sendOtp,
    verifyOtp,
    verifyOtpAndChangePassword,
    forgotPassword
};
