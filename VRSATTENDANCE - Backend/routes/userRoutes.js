const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const validateEmail = require('../middleware/validateEmail'); // Import middleware if used
const authenticateToken = require('../middleware/authenticateToken');
const authorizeAdmin = require('../middleware/authorizeAdmin');

router.get('/me', authenticateToken, userController.getUserProfile);
router.post('/profile', authenticateToken, userController.updateUserProfile);
router.post('/assign-manager/:userId', authenticateToken, userController.assignManager);
router.post('/check-email', validateEmail, userController.checkEmail);
router.get('/users', authenticateToken, userController.getAllUsers);
router.get('/search', authenticateToken, userController.searchUsers);
router.post('/update-employee-id', authenticateToken, userController.updateEmployeeIdForUser);
router.delete('/users/:id', authenticateToken, userController.deleteUser);
router.put('/users/:id', authenticateToken, userController.editUser);
router.post('/user-project-tags/assign-project-tag', authenticateToken, authorizeAdmin, userController.assignUserProjectTag);
router.put('/admin/update/:id', authenticateToken, userController.updateEmployee);



module.exports = router;
