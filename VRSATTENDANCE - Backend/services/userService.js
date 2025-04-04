const User = require('../models/User');
const mongoose = require('mongoose');

exports.getUserById = async (userId) => {
    const user = await User.findById(userId);

    const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


    if (user && user.managerEmail) {
        const manager = await User.findOne({ email: user.managerEmail });
        if (manager) {
            user.managerName = manager.name; // Set the manager's name based on the email
        }
    }

    return user;
};

exports.updateUserProfile = async (userId, profileData) => {

    const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    // Directly use userId without ObjectId conversion for testing
    return await User.findByIdAndUpdate(userId, profileData, { new: true });
};

// Fetch a user by employeeId to ensure uniqueness
exports.getUserByEmployeeId = async (employeeId) => {
    return await User.findOne({ employeeId });
};

// Update the employeeId for the target user
exports.updateEmployeeId = async (userId, employeeId) => {
    return await User.findByIdAndUpdate(userId, { employeeId }, { new: true });
};


exports.assignManager = async (userId, managerId, managerRole) => {
    try {
        // Fetch the manager's details based on managerId
        const manager = await User.findById(managerId).select('name email');

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        if (!manager) {
            throw new Error('Manager not found');
        }

        console.log(`Fetched manager: ${manager.name}, ${manager.email}`);

        // Prepare the update data
        const updateData = {
            managerId,
            managerName: manager.name, // Set manager's name
            managerEmail: manager.email, // Set manager's email
            managerRole // Set manager's role
        };

        // Update the user's details
        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true });

        console.log(`Updated user: ${updatedUser}`);

        return updatedUser;
    } catch (error) {
        console.error('Error assigning manager:', error);
        throw error;
    }
};


exports.emailExists = async (email) => {
    const user = await User.findOne({ email });
    return user !== null;
};

exports.searchUsers = async (query) => {
    const searchCriteria = {
        $or: [
            { name: { $regex: query, $options: 'i' } },  // case-insensitive search for name
            { email: { $regex: query, $options: 'i' } }  // case-insensitive search for email
        ],
    };

    return await User.find(searchCriteria);
};

exports.deleteUser = async (userId, requester) => {
    const userToDelete = await User.findById(userId);
    console.log('User to Delete:', userToDelete); // Log the user to delete

    if (!userToDelete) {
        throw new Error('User not found');
    }

    // Role-based deletion rules
    console.log('Requester Role:', requester.role); // Log the requester's role
    if (requester.role === 3) {
        throw new Error('Manager/Employee cannot delete users');
    }
    if (requester.role === 2 && [1, 2].includes(userToDelete.role)) {
        throw new Error('Admin cannot delete other admins or super admins');
    }

    // Proceed if requester is Super Admin (role 1)
    await User.findByIdAndDelete(userId);
    return userToDelete;
};

exports.editUser = async (userId, updateData, requester) => {
    const userToEdit = await User.findById(userId);

    const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


    if (!userToEdit) {
        throw new Error('User not found');
    }

    // Role-based edit rules
    if (requester.role === 3) {
        throw new Error('Manager/Employee cannot edit users');
    }
    if (requester.role === 2 && [1, 2].includes(userToEdit.role)) {
        throw new Error('Admin cannot edit other admins or super admins');
    }

    // Proceed to update user information
    Object.assign(userToEdit, updateData);
    await userToEdit.save();
    return userToEdit;
};

exports.assignUserProjectTag = async (userId, projectTag) => {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('User not found');
        }
        user.UserTags = projectTag;
        await user.save();
        return user;
    } catch (error) {
        throw new Error(error.message);
    }
};

exports.updateEmployeeDetails = async (adminUser, employeeId, updateData) => {
    // Fetch the employee record
    const employee = await User.findById(employeeId);
    if (!employee) {
        const error = new Error('Employee not found');
        error.statusCode = 404;
        throw error;
    }

    // Check if admin is allowed to update this employee
    if (adminUser.role === 1 && (employee.role === 2 || employee.role === 3)) {
        // Admin role 1 can update roles 2 and 3
    } else if (adminUser.role === 2 && employee.role === 3) {
        // Admin role 2 can update role 3
    } else {
        const error = new Error('Unauthorized to update this employee');
        error.statusCode = 403;
        throw error;
    }

    // Perform the update
    Object.assign(employee, updateData);
    await employee.save();

    return employee;
};

exports.getEmployeesUnderManager = async (managerEmail) => {
    return await User.find({ managerEmail: managerEmail, role: 3 });
};
