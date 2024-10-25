const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const validateEmail = require('../middleware/validateEmail'); // Import middleware if used
const authenticateToken = require('../middleware/authenticateToken');

router.get('/me', authenticateToken, userController.getUserProfile);
router.post('/profile', authenticateToken, userController.updateUserProfile);
router.post('/assign-manager/:userId', authenticateToken, userController.assignManager);
router.post('/check-email', validateEmail, userController.checkEmail);
router.get('/users', authenticateToken, userController.getAllUsers);
router.get('/search', authenticateToken, userController.searchUsers);
router.post('/update-employee-id', authenticateToken, userController.updateEmployeeIdForUser);


module.exports = router;
