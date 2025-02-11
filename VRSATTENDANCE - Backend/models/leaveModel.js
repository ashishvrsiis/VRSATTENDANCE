// leaveModel.js
const mongoose = require('mongoose');

const leaveSchema = new mongoose.Schema({
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  reason: { type: String, required: true },
  status: { type: String, enum: ['Pending', 'Approved', 'Rejected'], default: 'Pending' },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  approverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  rejectionReason: { type: String },
  leaveType: { type: String, enum: ['Sick', 'Vacation', 'Personal', 'Maternity', 'Paternity','Punch - Out', 'Custom'], required: true },
  customApprovedStartDate: { type: Date }, // New field for custom start date
  customApprovedEndDate: { type: Date } // New field for custom end date
});

module.exports = mongoose.model('Leave', leaveSchema);
