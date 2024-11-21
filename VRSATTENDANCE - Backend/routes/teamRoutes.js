const express = require('express');
const { fetchTeamHierarchy } = require('../controllers/teamController');
const authenticate = require('../middleware/authenticateToken'); // Import correctly

const router = express.Router();

// Route to fetch team hierarchy
router.get('/teams', authenticate, fetchTeamHierarchy);

module.exports = router;
