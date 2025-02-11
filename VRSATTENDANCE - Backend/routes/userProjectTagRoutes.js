const express = require('express');
const router = express.Router();
const { createTag, getAllTagNames } = require('../controllers/userProjectTagController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeAdmin = require('../middleware/authorizeAdmin');

router.post('/user-project-tags/create', authenticateToken, authorizeAdmin, createTag);
router.get('/user-project-tags/all-names', authenticateToken, authorizeAdmin, getAllTagNames);

module.exports = router;
