const authService = require('../services/authService');
const sendNotification = require('../utils/notification');
const User = require('../models/User');
const otpService = require('../services/otpService');
const emailService = require('../services/LoginemailService');
const verifyEmailService = require('../services/verifyEmailService');
const { sendNotificationEmail } = require('../services/registrationemailService');


const register = async (req, res) => {
    try {
        const currentUser = req.user; // Get the current user's role and manager status
        const userData = req.body; // New user data from request body

        // Pass currentUser to the service for role-based logic
        const response = await authService.registerUser(userData, currentUser);
        res.status(201).json(response);
    } catch (error) {
        console.error('Registration error:', error.message);
        res.status(400).json({ message: error.message });
    }
};

const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const response = await authService.loginUser(email, password);
        res.status(200).json(response);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const verifyLoginOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const response = await authService.verifyLoginOtp(email, otp);
        res.status(200).json(response);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// Get pending registrations
const getPendingRegistrations = async (req, res) => {
    console.log('Fetching pending registrations...');
    try {
        if (req.user.role !== 1 && req.user.role !== 2) {
            console.log('Access denied for user role:', req.user.role);
            return res.status(403).json({ message: 'Access denied' });
        }
        const pendingUsers = await User.find({ isApproved: false });
        console.log('Pending users:', pendingUsers);
        res.status(200).json(pendingUsers);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        console.log('Error fetching pending registrations:', error);
        res.status(500).json({ message: error.message });
    }
};

// Approve registration
const approveRegistration = async (req, res) => {
    console.log('Approving registration for user ID:', req.params.id);
    try {
        if (req.user.role !== 1 && req.user.role !== 2) {
            console.log('Access denied for user role:', req.user.role);
            return res.status(403).json({ message: 'Access denied' });
        }
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) {
            console.log('User not found for ID:', id);
            return res.status(404).json({ message: 'User not found' });
        }
        user.isApproved = true;
        await user.save();

        console.log('Sending approval notification...');
        // Notify the user about approval
        await sendNotificationEmail(user.email, {
            subject: 'Account Approved',
            templateName: 'accountApproved',
            replacements: { name: user.name }
        });

        res.status(200).json({ message: 'User approved successfully' });

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        console.log('Error approving registration:', error);
        res.status(500).json({ message: error.message });
    }
};

// Reject registration
const rejectRegistration = async (req, res) => {
    console.log('Rejecting registration for user ID:', req.params.id);
    try {
        if (req.user.role !== 1 && req.user.role !== 2) {
            console.log('Access denied for user role:', req.user.role);
            return res.status(403).json({ message: 'Access denied' });
        }
        const { id } = req.params;
        const user = await User.findById(id);
        if (!user) {
            console.log('User not found for ID:', id);
            return res.status(404).json({ message: 'User not found' });
        }
        await User.findByIdAndDelete(id);

        console.log('Sending rejection notification...');
        // Notify the user about rejection
        await sendNotificationEmail(user.email, {
            subject: 'Account Rejected',
            templateName: 'accountRejected',
            replacements: { name: user.name }
        });

        res.status(200).json({ message: 'User rejected successfully' });

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        console.log('Error rejecting registration:', error);
        res.status(500).json({ message: error.message });
    }
};

const requestOtp = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        if (user.isEmailVerified) {
            return res.status(400).json({ message: 'Email is already verified' });
        }

        const otp = otpService.generateOtp(email);

        // Send OTP email using the verifyEmailService
        await verifyEmailService.sendNotificationEmail(email, {
            subject: 'Your OTP for Email Verification',
            templateName: 'verifyEmail',  // Use the correct template name
            replacements: { name: user.name, otp: otp }
        });

        res.status(200).json({ message: 'OTP sent to your email address' });

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const verifyOtp = async (req, res) => {
    try {
        const { email, otp } = req.body;
        otpService.verifyOtp(email, otp);

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        user.isEmailVerified = true;
        await user.save();

        res.status(200).json({ message: 'Email verified successfully' });

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = { register, login, approveRegistration, rejectRegistration, getPendingRegistrations, requestOtp, verifyOtp, verifyLoginOtp};
