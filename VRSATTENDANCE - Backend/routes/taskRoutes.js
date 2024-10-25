const express = require('express');
const taskController = require('../controllers/taskController');
const authMiddleware = require('../middleware/authenticateToken');

const router = express.Router();

// Route to create a new task
router.post('/create', authMiddleware, (req, res, next) => {
    console.log('Middleware set req.user:', req.user);
    taskController.createTask(req, res).catch(next);
});

// Route to get all tasks assigned to the logged-in user
router.get('/', authMiddleware, (req, res, next) => {
    console.log('GET /tasks route hit');
    taskController.getTasks(req, res).catch(next);
});

// Route to update the status of a task
router.patch('/status', authMiddleware, (req, res, next) => {
    console.log('PATCH /tasks/status route hit');
    taskController.updateTaskStatus(req, res).catch(next);
});

module.exports = router;
