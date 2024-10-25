// routes/locationRoutes.js
const express = require('express');
const router = express.Router();
const authenticateToken = require('../middleware/authenticateToken');
const locationController = require('../controllers/locationController');

// Protected routes
router.post('/locations', authenticateToken, locationController.createLocation);
router.get('/locations', authenticateToken, locationController.getLocations);
router.put('/locations/:locationName', authenticateToken, locationController.updateLocation);

module.exports = router;
