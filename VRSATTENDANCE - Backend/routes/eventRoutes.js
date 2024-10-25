const express = require('express');
const eventController = require('../controllers/eventController');
const authMiddleware = require('../middleware/authenticateToken');

const router = express.Router();

router.get('/', authMiddleware, eventController.getEvents);
router.post('/create', authMiddleware, eventController.createEvent);

module.exports = router;
