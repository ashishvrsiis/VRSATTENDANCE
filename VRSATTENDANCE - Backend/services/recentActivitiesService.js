const RecentActivity = require('../models/RecentActivity');
const Attendance = require('../models/Attendance');
const Task = require('../models/task');

exports.fetchRecentActivities = async (userId) => {
    try {
        const activities = [];

        // Fetch from RecentActivity collection
        const recentActivities = await RecentActivity.find({ userId }).sort({ timestamp: -1 });
        activities.push(...recentActivities.map(activity => ({
            ...activity.toObject(),
            source: 'recentActivity'
        })));

        // Fetch from Attendance collection
        const attendanceRecords = await Attendance.find({ userId }).sort({ createdAt: -1 });
        activities.push(...attendanceRecords.map(record => ({
            ...record.toObject(),
            source: 'Attendance'
        })));

        // Fetch from Task collection
        const taskRecords = await Task.find({ assignedTo: userId }).sort({ createdAt: -1 }); // Use createdAt for sorting tasks
        activities.push(...taskRecords.map(record => ({
            ...record.toObject(),
            source: 'Task'
        })));

        // Sort all activities by timestamp in descending order
        activities.sort((a, b) => b.timestamp - a.timestamp);

        return activities;
    } catch (error) {
        console.error('Error fetching recent activities:', error.message);
        throw new Error('Failed to fetch recent activities');
    }
};
