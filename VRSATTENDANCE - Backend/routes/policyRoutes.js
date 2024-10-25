const express = require('express');
const router = express.Router();
const policyController = require('../controllers/policyController');

// GET /api/policy/:type
router.get('/policy/:type', policyController.getPolicy);

// PUT /api/policy/:type
router.put('/policy/:type', policyController.updatePolicy);

module.exports = router;
