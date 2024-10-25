const express = require('express');
const router = express.Router();
const deliveryController = require('../controllers/notificationdeliveryController');
const authenticateToken = require('../middleware/authenticateToken');

// Define the route for updating delivery status
router.post('/update-status', authenticateToken, deliveryController.updateDeliveryStatus);

module.exports = router;
