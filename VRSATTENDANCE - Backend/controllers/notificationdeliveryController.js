const deliveryService = require('../services/notificationDeliveryService');

exports.updateDeliveryStatus = async (req, res) => {
    try {
        const { notificationId, status } = req.body;

        const delivery = await deliveryService.updateDeliveryStatus(notificationId, status);

        if (!delivery) {
            return res.status(404).json({ error: 'Delivery not found' });
        }

        res.json({
            message: 'Delivery status updated successfully.',
            delivery
        });
    } catch (error) {
        console.error('Error updating delivery status:', error);
        res.status(500).json({ error: error.message });
    }
};
