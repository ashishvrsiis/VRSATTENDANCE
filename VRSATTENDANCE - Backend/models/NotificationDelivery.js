const mongoose = require('mongoose');

const deliverySchema = new mongoose.Schema({
    notificationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification', required: true },
    deliveryStatus: { type: String, enum: ['delivered', 'failed'], default: 'delivered' },
    deliveredAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Delivery', deliverySchema);
