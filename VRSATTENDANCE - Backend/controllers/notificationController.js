const notificationService = require('../services/notificationService');
const deliveryService = require('../services/notificationDeliveryService');

exports.createNotification = async (req, res) => {
    try {
        const { userId } = req.body; // Get userId from the request body
        const { title, message } = req.body;

        // Validate input
        if (!userId || !title || !message) {
            return res.status(400).json({ error: 'User ID, title, and message are required.' });
        }

        // Check if the user is an admin
        if (req.user.role !== 1 && req.user.role !== 2) {
            console.log('User is not an admin. Role:', req.user.role);
            return res.status(403).json({ error: 'Access denied. Only admins can create notifications.' });
        }

        // Create notification for the specific user
        const notification = await notificationService.createNotification({
            userId,
            title,
            message
        });

        // Simulate delivery (for demonstration)
        const delivery = await deliveryService.recordDelivery(notification._id);

        res.status(201).json({
            message: 'Notification created successfully.',
            notification,
            delivery
        });
    } catch (error) {
        console.error('Error creating notification:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getNotificationStatus = async (req, res) => {
    try {
        const { notificationId } = req.params;
        const notification = await notificationService.getNotificationById(notificationId);

        if (!notification) {
            return res.status(404).json({ error: 'Notification not found' });
        }

        const delivery = await deliveryService.getDeliveryByNotificationId(notificationId);

        res.json({
            notification,
            delivery
        });
    } catch (error) {
        console.error('Error fetching notification status:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.getNotificationsForUser = async (req, res) => {
    try {
        const userId = req.user?.userId;
        console.log('Authenticated user ID:', userId);

        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }

        const notifications = await notificationService.getNotificationsByUserId(userId);

        if (!notifications.length) {
            return res.status(404).json({ error: 'No notifications found for this user' });
        }

        res.json({ notifications });
    } catch (error) {
        console.error('Error fetching notifications for user:', error);
        res.status(500).json({ error: error.message });
    }
};
