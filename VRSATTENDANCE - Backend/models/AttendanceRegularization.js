const mongoose = require('mongoose');

const AttendanceSchema = new mongoose.Schema({
  approverName: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Reference to User model
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  remarks: { type: String },
  leaveType: { type: String, required: true },
  status: { type: String, enum: ['Submitted', 'Approved', 'Rejected'], default: 'Submitted' },
  reason: { type: String } // Optional reason
});

module.exports = mongoose.model('AttendanceRegularization', AttendanceSchema);
