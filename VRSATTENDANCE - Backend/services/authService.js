const User = require('../models/User');
const sendNotification = require('../utils/notification'); // Adjust the path if needed
const { generateAccessToken, generateRefreshToken } = require('../utils/generateToken');
const bcrypt = require('bcryptjs');
const { sendEmail } = require('./LoginemailService'); // Adjust the path if needed
const { sendRegistrationEmail } = require('./registrationemailnotificationService');
const { sendNotificationEmail } = require('./passwordChangeEmailService');



const registerUser = async (userData, currentUser) => {
    console.log('registerUser invoked with userData:', userData);
    console.log('Current user details:', currentUser);
    let {
        name,
        fatherName,
        email,
        password,
        re_password,
        role,
        phone,
        dateOfBirth,
        position,
        managerEmail,
        managerRole,
        workLocation,
        website,
        employeeId,
        manager,
        UserTags
    } = userData;

    if (!Array.isArray(UserTags) || UserTags.length === 0) {
        throw new Error('UserTags are required during registration');
    }    

    try {

        email = email.toLowerCase().trim();
        if (managerEmail) {
            managerEmail = managerEmail.toLowerCase().trim();
        }
        if (employeeId) {
            employeeId = employeeId.toLowerCase().trim();
        }
    // Validate passwords match
    if (password !== re_password) {
        console.error('Password mismatch: password and re_password do not match');
        throw new Error('Passwords do not match');
    }
    console.log('Passwords match');

    // Ensure email and employee ID are unique
    const userExists = await User.findOne({ email });
    if (userExists) {
        console.error(`Email already exists: ${email}`);
        throw new Error('User already exists');
    }
    console.log('Email is unique');

    const employeeIdExists = await User.findOne({ employeeId });
    if (employeeIdExists) {
        console.error(`Employee ID already exists: ${employeeId}`);
        throw new Error('Employee ID already exists');
    }
    console.log('Employee ID is unique');

    // Check current user's role and manager status
    const currentUserRole = currentUser.role;
    const isManagerTrue = currentUser.manager; // True or False, set from token or DB
    console.log('Current user role:', currentUserRole);
    console.log('Is manager:', isManagerTrue);

    if (currentUserRole === 1) {
        // Super Admin can register roles 2 (Admin) and 3 (Managers/Employees)
        console.log('Super Admin attempting to register a user');
        if (![2, 3].includes(role)) {
            console.error('Super Admin attempted to register an invalid role:', role);
            throw new Error('Super Admin can only register roles 1, 2, and 3');
        }
    } else if (currentUserRole === 2) {
        // Admin can register only role 3 (Managers/Employees)
        console.log('Admin attempting to register a user');
        if (role !== 3) {
            console.error('Admin attempted to register an invalid role:', role);
            throw new Error('Admins can only register Managers/Employees');
        }
    } else if (currentUserRole === 3) {
        // Manager can register only employees with `manager: false`
        console.log('Manager attempting to register a user');
        if (!isManagerTrue) {
            console.error('Manager does not have sufficient permissions (manager=false)');
            throw new Error('Access denied. Only managers with the appropriate permissions can register new accounts.');
        }
        if (role !== 3 || manager) {
            console.error('Manager attempted to register an invalid role or manager=true');
            throw new Error('Managers can only register Employees with "manager: false".');
        }
    } else {
        console.error('Unauthorized user role attempting to register a user:', currentUserRole);
        throw new Error('Unauthorized role for registration');
    }

    // Handle manager assignment
    let managerId = null;
    if (managerEmail) {
        console.log('Checking manager assignment for email:', managerEmail);
        const manager = await User.findOne({ email: managerEmail, role: 3 });
        if (!manager) {
            console.error('Manager not found with email:', managerEmail);
            throw new Error('Manager not found');
        }
        console.log('Manager found:', manager);
        managerId = manager._id;
    }

    // Create the user

    console.log('Creating new user with the following data:', {
        name,
        fatherName,
        email,
        role,
        phone,
        position,
        managerId,
        workLocation,
        UserTags
    });

    const user = new User({
        name,
        fatherName,
        email,
        password,
        role,
        phone,
        dateOfBirth,
        position,
        managerId,
        managerEmail,
        managerRole,
        workLocation,
        website,
        employeeId,
        isApproved: false,
        isEmailVerified: false,
        UserTags
    });

    // Save user to the database
    console.log('Saving user to database...');
    await user.save();
    console.log('User saved successfully:', user);

    // Notify admins if necessary
    if ([1, 2].includes(currentUserRole)) {
        console.log('Notifying admins for new user registration');
        await notifyAdmins(user);
    }

    console.log('Registration process completed successfully');

    return { message: 'User registered successfully. Awaiting approval and verification.' };
} catch (error) {
    console.error('Error during user registration:', error.message);
    throw error; // Re-throw the error to be handled by the calling function
}
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

const loginUser = async (email, password) => {
    email = email.toLowerCase().trim();
    const user = await User.findOne({ email });
    if (!user) throw new Error('User not found.');

        // Check if the user is blocked
    if (user.isBlocked) throw new Error('This account has been temporarily disabled. Please contact your administrator for assistance.');

    // Verify the password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('The password you entered is incorrect. Please verify and try again.');

    // Ensure the user is approved
    if (!user.isApproved) throw new Error('Thank you for registering with us. Your account is under administrative review and will be activated once approved. If you do not receive an update within 15 days, kindly reach out to our support team or your administrator for further assistance.');

    if (user.otpEnabled) {
        // Generate OTP and send via email
        const generatedOtp = generateOTP();
        user.otp = generatedOtp;
        user.otpExpires = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes
        await user.save();
        await sendOtpEmail(user.email, user.name, generatedOtp);

        return { 
            message: 'OTP sent to your email', 
            otpRequired: true 
        };
    } else {
        // Generate access and refresh tokens
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        return {
            message: 'Login successful',
            otpRequired: false,
            access: accessToken,  // Directly return access token
            refresh: refreshToken // Directly return refresh token
        };
    }
};

const toggleOtp = async (userId, otpEnabled) => {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found.');

    user.otpEnabled = otpEnabled;
    await user.save();

    return { message: `OTP ${otpEnabled ? 'enabled' : 'disabled'} for the user.` };
};

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

const blockUser = async (targetUserId, currentUser) => {
    console.log(`Attempting to block user: ${targetUserId} by ${currentUser.email}`);

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
        throw new Error('User not found.');
    }

    // Role-based blocking logic
    if (currentUser.role === 1) {
        // Super Admin (1) can block Admin (2) & Employee/Manager (3)
        if (![2, 3].includes(targetUser.role)) {
            throw new Error('Super Admin can only block Admins and Employees.');
        }
    } else if (currentUser.role === 2) {
        // Admin (2) can only block Employee/Manager (3)
        if (targetUser.role !== 3) {
            throw new Error('Admins can only block Employees.');
        }
    } else {
        throw new Error('Unauthorized: Only Admins and Super Admins can block users.');
    }

    targetUser.isBlocked = true;
    await targetUser.save();

    console.log(`User ${targetUser.email} blocked successfully.`);
    return { message: `User ${targetUser.email} has been blocked successfully.` };
};

const unblockUser = async (targetUserId, currentUser) => {
    console.log(`Attempting to unblock user: ${targetUserId} by ${currentUser.email}`);

    const targetUser = await User.findById(targetUserId);
    console.log(`Target User Role: ${targetUser.role}`);
    if (!targetUser) {
        throw new Error('User not found.');
    }

    // Role-based unblocking logic (same as blocking)
    if (currentUser.role === 1) {
        if (![2, 3].includes(targetUser.role)) {
            throw new Error('Super Admin can only unblock Admins and Employees.');
        }
    } else if (currentUser.role === 2) {
        if (targetUser.role !== 3) {
            throw new Error('Admins can only unblock Employees.');
        }
    } else {
        throw new Error('Unauthorized: Only Admins and Super Admins can unblock users.');
    }

    targetUser.isBlocked = false;
    await targetUser.save();

    console.log(`User ${targetUser.email} unblocked successfully.`);
    return { message: `User ${targetUser.email} has been unblocked successfully.` };
};


module.exports = { registerUser, loginUser, generateOTP, sendOtpEmail, verifyLoginOtp, toggleOtp, blockUser, unblockUser };
