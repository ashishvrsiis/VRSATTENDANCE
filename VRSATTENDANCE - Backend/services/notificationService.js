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

exports.createNotificationsBulk = async (notifications) => {
    return await Notification.insertMany(notifications);
};

exports.findNotification = async (filter) => {
    return await Notification.findOne(filter);
};

exports.countUnreadNotifications = async (userId) => {
    const objectId = new mongoose.Types.ObjectId(userId);
    return await Notification.countDocuments({ userId: objectId, isRead: false });
};

exports.markAllAsRead = async (userId) => {
    const objectId = new mongoose.Types.ObjectId(userId);
    return await Notification.updateMany(
        { userId: objectId, isRead: false },
        { $set: { isRead: true } }
    );
};

exports.sendWelcomeNotification = async (user) => {
    try {
        const notification = new Notification({
            userId: user._id,
            title: 'Welcome to VRSIIS HRM! 🎉',
            message: `Dear ${user.name}, welcome to VRSIIS HRM! We're delighted to have you on board. We look forward to your valuable contributions and wish you great success in your journey with us at ${user.workLocation || 'our organization'}.`,
            type: 'welcome',
            isRead: false,
            createdAt: new Date()
        });

        await notification.save();

        console.log(`🎉 Welcome notification saved and sent to ${user.email}`);
    } catch (error) {
        console.error('Error sending welcome notification:', error.message);
        throw error;
    }
};