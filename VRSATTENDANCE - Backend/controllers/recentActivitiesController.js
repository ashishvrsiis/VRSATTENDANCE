// controllers/recentActivitiesController.js
const recentActivitiesService = require('../services/recentActivitiesService');

exports.getRecentActivities = async (req, res) => {
    try {
        const userId = req.user.userId; // Get userId from authenticated token
        const activities = await recentActivitiesService.fetchRecentActivities(userId);
        res.json(activities);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
