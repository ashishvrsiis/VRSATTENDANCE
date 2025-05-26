const express = require('express');
const router = express.Router();
const { createTag, getAllTagNames, removeUserTag } = require('../controllers/userProjectTagController');
const authenticateToken = require('../middleware/authenticateToken');
const authorizeAdmin = require('../middleware/authorizeAdmin');

router.post('/user-project-tags/create', authenticateToken, authorizeAdmin, createTag);
router.get('/user-project-tags/all-names', authenticateToken, authorizeAdmin, getAllTagNames);
router.delete('/user-project-tags/remove', authenticateToken, removeUserTag);

module.exports = router;
