// models/LeaveBalance.js
const mongoose = require('mongoose');

const leaveBalanceSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType: { type: String, enum: ['Sick', 'Vacation', 'Personal', 'Maternity', 'Paternity'], required: true },
    totalLeaves: { type: Number, required: true },
    consumedLeaves: { type: Number, default: 0 }, // Add default value if needed
    availableLeaves: { type: Number, required: true },
});


module.exports = mongoose.model('LeaveBalance', leaveBalanceSchema);
