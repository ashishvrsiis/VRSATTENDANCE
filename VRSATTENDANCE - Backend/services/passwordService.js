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
            console.log(`[sendOtp] Called with: ${email}`);
        const expiration = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

        // Find user by email
        console.log(`[sendOtp] Looking for user: ${email}`);
        const user = await User.findOne({ email });
        if (!user) {
        console.error(`[sendOtp] User not found: ${email}`);
            throw new Error('User not found');
        }
        console.log(`[sendOtp] Found user: ${user.name}`);
        const managers = await User.find({ role: 3 });
        console.log(`[sendOtp] Managers count: ${managers.length}`);
        console.log(managers); // All managers with the updated 'manager' field

        // Update user with OTP and expiration
        user.otp = otp;
        user.otpExpires = expiration;
        await user.save();
        console.log(`[sendOtp] Saved OTP to user: ${email}`);

        // Send OTP email for forgot password
        console.log(`[sendOtp] Sending email to: ${user.email}`);
        await sendNotificationEmail(user.email, {
            subject: 'Password Reset Request',  // Set subject here
            templateName: 'forgotPassword',     // Specify the correct template
            replacements: { name: user.name, otp: otp }
        });
        console.log(`[sendOtp] Email sent successfully to: ${user.email}`);

        return 'OTP sent to your email address.';
    } catch (error) {
        console.error(`[sendOtp] Error: ${error.message}`);
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
        console.log(`[passwordService] Called with:`, { email, newPassword: !!newPassword, otp: !!otp });
        // If OTP and new password are provided, verify OTP and change password
        if (otp && newPassword) {
            console.log(`[passwordService] Verifying OTP and changing password for: ${email}`);
            return await verifyOtpAndChangePassword(email, otp, newPassword);
        }

        // Otherwise, generate and send OTP for forgot password
        console.log(`[passwordService] Sending OTP to: ${email}`);
        return await sendOtp(email);
    } catch (error) {
        console.error(`[passwordService] Error: ${error.message}`);
        throw new Error(`Error handling forgot password request: ${error.message}`);
    }
};

module.exports = {
    sendOtp,
    verifyOtp,
    verifyOtpAndChangePassword,
    forgotPassword
};
