const taskService = require('../services/taskService');
const userService = require('../services/userService');
const jwt = require('jsonwebtoken');


exports.createTask = async (req, res) => {
    try {
        console.log('Request user object:', req.user); // Log the user object

        // Decode the token to check its contents
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            const decoded = jwt.decode(token);
            console.log('Decoded token in createTask:', decoded);
        }

        const { title, description, assignedTo, dueDate } = req.body;

        // Check if the user data is present and valid
        if (!req.user || !req.user.userId || !req.user.role) {
            console.log('Error: User data not found in request or missing role/userId');
            return res.status(400).json({ error: 'User data not found or incomplete' });
        }

        // Validate required fields
        if (!title || !assignedTo || !dueDate) {
            return res.status(400).json({ error: 'Title, assignedTo, and dueDate are required fields' });
        }

        // Create the task
        const taskData = {
            title,
            description,
            assignedBy: req.user.userId,  // The user creating the task
            assignedTo,
            dueDate
        };

        const newTask = await taskService.createTask(taskData);

        // Respond with the created task
        res.status(201).json({
            message: 'Task created successfully',
            task: newTask
        });

    } catch (error) {
        console.error('Error creating task:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};



exports.getTasks = async (req, res) => {
    try {
        const userId = req.user.userId; // Use userId from req.user
        const tasks = await taskService.getTasksByUser(userId);
        res.status(200).json(tasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.updateTaskStatus = async (req, res) => {
    try {
        const { taskId, status } = req.body;

        if (!taskId || !status) {
            return res.status(400).json({ error: 'Task ID and status are required' });
        }

        const task = await taskService.updateTaskStatus(taskId, status);

        if (task) {
            res.status(200).json(task);
        } else {
            res.status(404).json({ error: 'Task not found' });
        }
    } catch (error) {
        console.error('Error updating task status:', error);
        res.status(500).json({ error: error.message });
    }
};
