const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');
const authenticateToken = require('../middleware/authenticateToken'); // Use the provided middleware

// Create a new holiday (Authorization: Role 1 or 2 required)
router.post('/create', authenticateToken, holidayController.createHoliday);

// Get all holidays
router.get('/', holidayController.getHolidays);

module.exports = router;
