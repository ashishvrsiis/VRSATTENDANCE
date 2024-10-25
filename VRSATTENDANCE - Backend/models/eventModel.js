const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  dueDate: { type: Date, required: true },  // Keep only the date field
  assignedTasks: { type: Array, default: [] }  // Keep it as an array for assigned tasks
});

module.exports = mongoose.model('Event', eventSchema);
