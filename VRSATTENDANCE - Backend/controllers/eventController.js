// controllers/eventController.js

const Event = require('../models/eventModel');
const Holiday = require('../models/holidayModel');  // Import Holiday model
const taskService = require('../services/taskService');

const getEvents = async (req, res) => {
    try {
        console.log('Request received at /api/v1/events');
        console.log('Request user:', req.user); // Log the whole req.user object

        const userId = req.user?.userId; // Correct extraction of user ID
        console.log('User ID extracted from token:', userId); // Log the extracted user ID

        if (!userId) {
            console.log('No user ID found, returning error.');
            return res.status(400).json({ message: 'User ID is missing' });
        }

        // Fetch all events
        const events = await Event.find();
        console.log('Events found:', events);

        // Fetch tasks assigned to the user
        const tasks = await taskService.getTasksByUser(userId);
        console.log('Tasks found for user:', tasks);

        // Fetch holiday data
        const holidays = await Holiday.find();
        console.log('Holidays found:', holidays);

        // Return all the data: events, tasks, and holidays
        res.json({ events, tasks, holidays });
    } catch (error) {
        console.error('Error in getEvents:', error);
        res.status(500).json({ message: error.message });
    }
};

const createEvent = async (req, res) => {
    try {
        console.log('Request received at /api/v1/events/create');
        console.log('Request body:', req.body);

        // Ensure the request body includes only the necessary fields
        const { title, description, dueDate, assignedTasks } = req.body;

        // Create the event with the updated structure
        const newEvent = new Event({ title, description, dueDate, assignedTasks });
        const savedEvent = await newEvent.save();

        console.log('New event created:', savedEvent);
        res.status(201).json(savedEvent);
    } catch (error) {
        console.error('Error in createEvent:', error);
        res.status(500).json({ message: error.message });
    }
};
module.exports = {
    getEvents,
    createEvent,
};
