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
    const {
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

    try {
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
    // if ([1, 2].includes(currentUserRole)) {
    //     console.log('Notifying admins for new user registration');
    //     await notifyAdmins(user);
    // }

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

//Original code with otp
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

//     const otp = generateOTP();
//     user.otp = otp;
//     user.otpExpires = Date.now() + 10 * 60 * 1000; // OTP valid for 10 minutes
//     await user.save();

//     // Pass the user's name to the email template
//     await sendOtpEmail(user.email, user.name, otp);

//     return { message: 'OTP sent to your email' };
// };

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

const loginUser = async (email, password) => {
    const user = await User.findOne({ email });
    if (!user) throw new Error('User not found.');

    // Verify the password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new Error('Invalid credentials');

    // Ensure the user is approved
    if (!user.isApproved) throw new Error('User account is not approved yet.');

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

module.exports = { registerUser, loginUser, generateOTP, sendOtpEmail, verifyLoginOtp, toggleOtp };
