const express = require('express');
const tokenController = require('../controllers/tokenController');

const router = express.Router();

router.post('/token/verify', tokenController.verifyToken);
router.post('/token/refresh', tokenController.refreshToken);

module.exports = router;
