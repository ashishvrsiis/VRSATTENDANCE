const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');
const authenticateToken = require('../middleware/authenticateToken');

router.post('/create', authenticateToken, notificationController.createNotification);
router.get('/:notificationId/status', authenticateToken, notificationController.getNotificationStatus);
router.get('/notifications', authenticateToken, notificationController.getNotificationsForUser);
router.get('/unread-count', authenticateToken, notificationController.getUnreadNotificationCount);
router.put('/mark-all-read', authenticateToken, notificationController.markAllNotificationsAsRead);


module.exports = router;
