const Delivery = require('../models/NotificationDelivery');
const Notification = require('../models/Notification');

exports.recordDelivery = async (notificationId) => {
    return await Delivery.create({ notificationId });
};

exports.getDeliveryByNotificationId = async (notificationId) => {
    return await Delivery.findOne({ notificationId });
};

exports.updateDeliveryStatus = async (notificationId, status) => {
    return await Delivery.findOneAndUpdate(
        { notificationId },
        { deliveryStatus: status, deliveredAt: Date.now() },
        { new: true }
    );
};
