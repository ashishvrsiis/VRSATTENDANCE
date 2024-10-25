// routes/recentActivities.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const recentActivitiesController = require('../controllers/recentActivitiesController');

// GET /api/recent-activities
router.get('/recent-activities', authenticateToken, recentActivitiesController.getRecentActivities);

module.exports = router;
