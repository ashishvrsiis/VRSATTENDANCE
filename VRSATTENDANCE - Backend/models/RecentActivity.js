const mongoose = require('mongoose');

const recentActivitySchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    activity: {
        type: String,
        required: true,
    },
    timestamp: {
        type: Date,
        default: Date.now,
    },
});

const RecentActivity = mongoose.models.RecentActivity || mongoose.model('RecentActivity', recentActivitySchema);

module.exports = RecentActivity;
