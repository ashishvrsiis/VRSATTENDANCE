const User = require('../models/User');
const sendNotification = require('../utils/notification'); // Adjust the path if needed
const { generateAccessToken, generateRefreshToken } = require('../utils/generateToken');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('./LoginemailService'); // Adjust the path if needed
const { sendRegistrationEmail } = require('./registrationemailnotificationService');
const { sendNotificationEmail } = require('./passwordChangeEmailService');



const registerUser = async (userData) => {
    const {
        name,
        email,
        password,
        re_password,
        role,
        phone,
        dateOfBirth,
        position,
        managerEmail, // Manager's email input by the user
        managerRole,
        workLocation,
        website,
        employeeId
    } = userData;

    if (!employeeId || employeeId.trim() === "") {
        throw new Error('Employee ID is required');
    }

    if (password !== re_password) {
        throw new Error('Passwords do not match');
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
        throw new Error('User already exists');
    }

    const employeeIdExists = await User.findOne({ employeeId });
    if (employeeIdExists) {
        throw new Error('Employee ID already exists');
    }

    // Validate managerEmail and retrieve manager details
    let managerId = null;
    if (managerEmail) {
        const manager = await User.findOne({ email: managerEmail, role: 3 }); // Assuming role 3 is for managers
        if (!manager) {
            throw new Error('Manager not found');
        }
        managerId = manager._id;
    }

    const user = new User({
        name,
        email,
        password,
        role,
        phone,
        dateOfBirth,
        position,
        managerId,
        managerEmail, // Store the manager's email
        managerRole,
        workLocation,
        website,
        employeeId,
        isApproved: false, // Account needs to be approved by admin
        isEmailVerified: false // Email verification needed
    });

    await user.save();

    // Notify admins about the pending account approval
    await notifyAdmins(user);

    // TODO: Send email verification link to the user

    return { message: 'Registration successful, pending email verification and admin approval' };
};

// Helper function to notify admins about new user registration
const notifyAdmins = async (newUser) => {
    // Find all admin users (super admins and regular admins)
    const admins = await User.find({ role: { $in: [1, 2] } });

    // Notify each admin with the registration request
    admins.forEach(admin => {
        sendRegistrationEmail(admin.email, {
            subject: 'New User Registration Approval Needed',
            replacements: {
                name: newUser.name,
                email: newUser.email,
                position: newUser.position,
                phone: newUser.phone,
                workLocation: newUser.workLocation,
            }
        });
    });
};

const generateOTP = () => {
    // Implement OTP generation logic
    return Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
};

// Function to send OTP via email
const sendOtpEmail = async (email, name, otp) => {
    const subject = 'Your OTP for Login';
    const message = `Your OTP is: ${otp}. It is valid for 10 minutes.`;  // Plain text message for fallback

    try {
        // Send email with dynamic data including name, email, and OTP
        await sendEmail(email, {
            subject,
            name,
            otp,
            email,  // Pass the email here to be used in the template
            message // Plain text version for fallback
        });
        console.log(`OTP sent to ${email}`);
    } catch (error) {
        console.error('Error sending OTP email:', error);
        throw new Error('Could not send OTP email.');
    }
};

//Original code with otp
const loginUser = async (email, password) => {
    const user = await User.findOne({ email });

    if (!user) {
        throw new Error('User not found.');
    }

    // Compare the password with the hashed password in the database
    const isMatch = await bcrypt.compare(password, user.password); 
    if (!isMatch) {
        throw new Error('Invalid credentials');
    }

    if (!user.isApproved) {
        throw new Error('User account is not approved yet');
    }

    const otp = generateOTP();
    user.otp = otp;
    user.otpExpires = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes
    await user.save();

    // Pass the user's name to the email template
    await sendOtpEmail(user.email, user.name, otp);

    return { message: 'OTP sent to your email' };
};

//Bypass otp temporary code
// const loginUser = async (email, password) => {
//     const user = await User.findOne({ email });
    
//     if (!user) {
//         throw new Error('User not found.');
//     }

//     // Compare the password with the hashed password in the database
//     const isMatch = await bcrypt.compare(password, user.password); 
//     if (!isMatch) {
//         throw new Error('Invalid credentials');
//     }

//     if (!user.isApproved) {
//         throw new Error('User account is not approved yet');
//     }

//     // Generate a new OTP and its expiration time
//     const otp = Math.floor(100000 + Math.random() * 900000); // Example 6-digit OTP
//     user.otp = otp;
//     user.otpExpires = Date.now() + 10 * 60 * 1000; // OTP expires in 10 minutes

//     // Try sending the OTP via email
//     const otpSent = await sendOtpEmail(email, otp);

//     if (otpSent) {
//         // OTP sent successfully, require OTP verification
//         await user.save();
//         return { message: 'OTP sent to your email. Please verify.' };
//     } else {
//         // OTP sending failed, bypass OTP verification
//         user.otp = null; // Clear OTP as we're bypassing it
//         user.otpExpires = null;
//         await user.save();

//         // Generate tokens and return directly without OTP verification
//         const accessToken = generateAccessToken(user._id);
//         const refreshToken = generateRefreshToken(user._id);

//         return { access: accessToken, refresh: refreshToken, message: 'Login successful, OTP bypassed.' };
//     }
// };

const verifyLoginOtp = async (email, otp) => {
    const user = await User.findOne({ email });

    if (!user || user.otp !== otp || user.otpExpires < Date.now()) {
        throw new Error('Invalid or expired OTP.');
    }

    // Clear OTP after successful verification
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    // Generate tokens after OTP verification
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    return { access: accessToken, refresh: refreshToken };
};

module.exports = { registerUser, loginUser, generateOTP, sendOtpEmail, verifyLoginOtp };
