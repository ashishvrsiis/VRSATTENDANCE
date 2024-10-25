const Task = require('../models/task');
const User = require('../models/User');

class TaskService {
    async createTask({ title, description, assignedBy, assignedTo, dueDate }) {
        console.log('Creating task with data:', { title, description, assignedBy, assignedTo, dueDate });
        const task = new Task({ title, description, assignedBy, assignedTo, dueDate });
        const savedTask = await task.save();
        console.log('Task created and saved:', savedTask);
        return savedTask;
    }

    async getTasksByUser(userId) {
        console.log('Fetching tasks for user:', userId);
        const tasks = await Task.find({ assignedTo: userId }).populate('assignedBy', 'name email');
        console.log('Tasks found:', tasks);
        return tasks;
    }

    async updateTaskStatus(taskId, status) {
        console.log('Updating task status for taskId:', taskId, 'to status:', status);
        const updatedTask = await Task.findByIdAndUpdate(taskId, { status }, { new: true });
        console.log('Updated task:', updatedTask);
        return updatedTask;
    }
}


module.exports = new TaskService();
