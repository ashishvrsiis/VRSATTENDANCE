const Notification = require('../models/Notification');
const mongoose = require('mongoose'); // Import mongoose


exports.createNotification = async (notificationData) => {
    return await Notification.create(notificationData);
};

exports.getNotificationById = async (notificationId) => {
    return await Notification.findById(notificationId);
};

exports.getNotificationsByUserId = async (userId) => {
    try {
        // Correct way to create an ObjectId instance
        const objectId = new mongoose.Types.ObjectId(userId);
        return await Notification.find({ userId: objectId });
    } catch (error) {
        console.error('Error fetching notifications by userId:', error);
        throw error;
    }
};