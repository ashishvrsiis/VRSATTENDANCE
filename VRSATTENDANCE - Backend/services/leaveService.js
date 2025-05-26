const Leave = require('../models/leaveModel');
const User = require('../models/User');
const mongoose = require('mongoose');
const { format } = require('date-fns');


exports.createLeave = async (employeeId, leaveData) => {
  // Ensure the employeeId and leaveType are included in the leaveData object
  const leave = new Leave({ ...leaveData, employeeId });
  return await leave.save();

  const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

};

exports.getAllLeaveRequests = async () => {
  return await Leave.find({});

  const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

};

// Get leave requests for a specific employee (for regular employees)
exports.getLeaveRequests = async (userId, userRole, options = {}) => {
  const { page = 1, limit = 10, status } = options;

  let filter = {};
  if (userRole === 1 || userRole === 2) {
    // Admin/Super Admin
    if (status) filter.status = status;
  } else if (userRole === 3) {
    // Manager
    const managedEmployees = await User.find({ managerId: userId }).select('_id');
    const managedEmployeeIds = managedEmployees.map(emp => emp._id);

    filter.$or = [
      { employeeId: userId },
      { employeeId: { $in: managedEmployeeIds } }
    ];
    if (status) filter.status = status;
  } else {
    // Regular employee
    filter.employeeId = userId;
    if (status) filter.status = status;
  }

  const total = await Leave.countDocuments(filter);
  const leaves = await Leave.find(filter)
    .skip((page - 1) * limit)
    .limit(limit)
    .sort({ createdAt: -1 });

  const processedLeaves = await Promise.all(
    leaves.map(async (leave) => {
      const applier = await User.findById(leave.employeeId).select('name managerId');
      const applierName = applier?.name || 'Unknown';

      let approverName = 'No approver assigned';
      if (applier?.managerId) {
        const manager = await User.findById(applier.managerId).select('name');
        approverName = manager?.name || 'No approver assigned';
      }

      const formatDate = (d) => d ? new Date(d).toISOString().split('T')[0] : null;

      let message = '';
      if (leave.status === 'Approved') {
        if (leave.customApprovedStartDate && leave.customApprovedEndDate) {
          message = `Your leave has been approved for the custom period from ${formatDate(leave.customApprovedStartDate)} to ${formatDate(leave.customApprovedEndDate)}.`;
        } else {
          message = `Your leave has been fully approved from ${formatDate(leave.startDate)} to ${formatDate(leave.endDate)}.`;
        }
      } else if (leave.status === 'Pending') {
        message = 'Your leave request is pending approval.';
      } else if (leave.status === 'Rejected') {
        message = `Your leave request was rejected. Reason: ${leave.rejectionReason || 'No reason provided'}.`;
      }

      return {
        ...leave._doc,
        startDate: formatDate(leave.startDate),
        endDate: formatDate(leave.endDate),
        customApprovedStartDate: formatDate(leave.customApprovedStartDate),
        customApprovedEndDate: formatDate(leave.customApprovedEndDate),
        message,
        applierName,
        approverName,
      };
    })
  );

  return {
    data: processedLeaves,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  };
};


// Get leave requests for a manager, including their own and their employees' leave requests
exports.getLeaveRequestsForManager = async (managerId) => {
  return await Leave.find({
    $or: [
      { employeeId: managerId }, // Manager's own leave requests
      { approverId: managerId }   // Leave requests of employees managed by the manager
    ]
  });

  const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

};

exports.approveLeave = async (leaveId, approverId, customStartDate = null, customEndDate = null) => {
  const updateFields = { status: 'Approved', approverId };

  const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

  // If custom dates are provided, add them to the update fields
  if (customStartDate && customEndDate) {
    updateFields.customApprovedStartDate = customStartDate;
    updateFields.customApprovedEndDate = customEndDate;
  }

  const leave = await Leave.findByIdAndUpdate(
    leaveId,
    updateFields,
    { new: true }
  );

  return leave;
};


exports.rejectLeave = async (leaveId, approverId, reason) => {
  // Find the leave by ID and update its status to rejected with a reason
  const leave = await Leave.findByIdAndUpdate(
    leaveId,
    { status: 'Rejected', approverId, reason },
    { new: true }
  );

  const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


  return leave;
};

exports.getLeaveById = async (leaveId) => {
  // Fetch leave by ID
  return await Leave.findById(leaveId).exec();

  const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

};