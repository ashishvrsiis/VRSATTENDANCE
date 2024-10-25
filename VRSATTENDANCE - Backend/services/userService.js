const User = require('../models/User');
const mongoose = require('mongoose');

exports.getUserById = async (userId) => {
    const user = await User.findById(userId);

    if (user && user.managerEmail) {
        const manager = await User.findOne({ email: user.managerEmail });
        if (manager) {
            user.managerName = manager.name; // Set the manager's name based on the email
        }
    }

    return user;
};

exports.updateUserProfile = async (userId, profileData) => {
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