const userService = require('../services/userService');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

exports.getUserProfile = async (req, res) => {
    try {
        const userId = req.user.userId; // Use userId from the token payload
        const user = await userService.getUserById(userId);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        if (user) {
            res.json({
                id: user._id,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role, // Directly return the numeric role value (1, 2, or 3)
                dateOfBirth: user.dateOfBirth,
                // profileImage: user.profileImage,
                position: user.position,
                managerName: user.managerName, // This will now be populated correctly
                managerRole: user.managerRole,
                workLocation: user.workLocation,
                website: user.website,
                employeeId: user.employeeId,
                isEmailVerified: user.isEmailVerified, // Return isEmailVerified
                manager: user.manager,
                // Avoid returning the password for security reasons
            });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ error: error.message });
    }
};


exports.updateUserProfile = async (req, res) => {
    try {
        const userId = req.user.userId; // Getting the userId from the token
        const {
            profileImage,
            name,
            dateOfBirth,
            phone,
            email,
            password,
            position,
            managerName,
            managerRole,
            workLocation,
            employeeId,
            website
        } = req.body;

        // Prepare the fields to update
        const updateData = {};
        if (profileImage) updateData.profileImage = profileImage;
        if (name) updateData.name = name;
        if (dateOfBirth) updateData.dateOfBirth = dateOfBirth;
        if (phone) updateData.phone = phone;
        if (email) updateData.email = email;
        if (position) updateData.position = position;
        if (managerName) updateData.managerName = managerName;
        if (managerRole) updateData.managerRole = managerRole;
        if (workLocation) updateData.workLocation = workLocation;
        if (employeeId) updateData.employeeId = employeeId;
        if (website) updateData.website = website;

        // Handle password separately
        if (password) {
            const salt = await bcrypt.genSalt(10);
            updateData.password = await bcrypt.hash(password, salt);
        }

        const user = await userService.updateUserProfile(userId, updateData);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        if (user) {
            res.json({ message: 'Profile updated successfully.', user });
        } else {
            res.status(404).json({ error: 'User not found or no changes made' });
        }
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.updateEmployeeIdForUser = async (req, res) => {
    try {
        const adminId = req.user.userId; // Getting the admin's userId from the token
        const { targetUserId, employeeId } = req.body; // User to be updated and new employeeId

        // Fetch the admin user to check role
        const adminUser = await userService.getUserById(adminId);

        // Check if the user is an admin (role 1 or 2)
        if (adminUser.role !== 1 && adminUser.role !== 2) {
            return res.status(403).json({ error: 'Unauthorized: Only admins can update employee IDs' });
        }

        // Ensure employeeId is provided
        if (!employeeId) {
            return res.status(400).json({ error: 'Employee ID is required' });
        }

        // Check if the employeeId is already in use
        const existingUser = await userService.getUserByEmployeeId(employeeId);
        if (existingUser) {
            return res.status(400).json({ error: 'Employee ID already exists' });
        }

        // Update the target user with the new employeeId
        const updatedUser = await userService.updateEmployeeId(targetUserId, employeeId);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        if (updatedUser) {
            res.json({ message: 'Employee ID updated successfully', user: updatedUser });
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Error updating employee ID:', error);
        res.status(500).json({ error: error.message });
    }
};


exports.assignManager = async (req, res) => {
    try {
        const userId = req.params.userId; // The user ID to whom the manager is being assigned
        const { managerId, managerRole } = req.body; // The manager's ID and role from the request body

        // Ensure managerId is provided
        if (!managerId) {
            return res.status(400).json({ message: 'Manager ID is required' });
        }

        console.log('Assigning manager with:', { userId, managerId, managerRole });

        // Assign manager to user
        const updatedUser = await userService.assignManager(userId, managerId, managerRole);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        if (updatedUser) {
            res.json({ message: 'Manager assigned successfully', user: updatedUser });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error('Error assigning manager:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};

exports.checkEmail = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

        const exists = await userService.emailExists(email);
        res.status(200).json({ emailExists: exists });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        const { role } = req.user;

        // Check if user role is Super admin or Admin
        if (role !== 1 && role !== 2) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        // Fetch all users
        const users = await User.find({}, '-profileImage');
        res.status(200).json(users);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Error fetching users' });
    }
};

exports.searchUsers = async (req, res) => {
    try {
        const query = req.query.q; // Get search query from URL parameters
        if (!query) {
            return res.status(400).json({ message: 'Search query is required.' });
        }

        const users = await userService.searchUsers(query);
        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found.' });
        }

        res.status(200).json(users);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        console.error('Error searching users:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteUser = async (req, res) => {
    try {
        console.log('Request Params:', req.params); // Log request parameters
        console.log('Requester Info:', req.user); // Log requester user info

        const deletedUser = await userService.deleteUser(req.params.id, req.user);
        res.status(200).json({ message: 'User deleted successfully', deletedUser });

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        console.error('Error Deleting User:', error.message); // Log error details
        res.status(403).json({ message: error.message });
    }
};

exports.editUser = async (req, res) => {
    try {
        const updatedUser = await userService.editUser(req.params.id, req.body, req.user);
        res.status(200).json({ message: 'User updated successfully', updatedUser });

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    } catch (error) {
        res.status(403).json({ message: error.message });
    }
};

exports.assignUserProjectTag = async (req, res) => {
    try {
        const { userId, projectTag } = req.body;

        if (!userId || !projectTag) {
            return res.status(400).json({ message: 'User ID and Project Tag are required' });
        }

        const updatedUser = await userService.assignUserProjectTag(userId, projectTag);
        res.status(200).json({ message: 'Project tag assigned successfully', user: updatedUser });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.updateEmployee = async (req, res) => {
    try {
        const adminUser = req.user; // Extract admin details from token
        const employeeId = req.params.id;
        const updateData = req.body;

        const updatedEmployee = await userService.updateEmployeeDetails(adminUser, employeeId, updateData);

        res.status(200).json({ message: 'Employee details updated successfully', employee: updatedEmployee });
    } catch (error) {
        res.status(error.statusCode || 500).json({ message: error.message });
    }
};

exports.getEmployeesByManager = async (req, res) => {
    try {
        const { email, manager } = req.user;

        if (!manager) {
            return res.status(403).json({ message: 'Only managers can access this resource.' });
        }

        const employees = await userService.getEmployeesUnderManager(email);

        return res.status(200).json({ employees });
    } catch (error) {
        console.error('Error fetching employees under manager:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
};