const Leave = require('../models/leaveModel');
const User = require('../models/User');
const mongoose = require('mongoose');
const { format } = require('date-fns');


exports.createLeave = async (employeeId, leaveData) => {
  // Ensure the employeeId and leaveType are included in the leaveData object
  const leave = new Leave({ ...leaveData, employeeId });
  return await leave.save();
};

exports.getAllLeaveRequests = async () => {
  return await Leave.find({});
};

// Get leave requests for a specific employee (for regular employees)
exports.getLeaveRequests = async (userId, userRole) => {
  let leaves;

  if (userRole === 1 || userRole === 2) {
    // Super admin (1) or admin (2): Retrieve all leave requests
    leaves = await Leave.find({});
  } else if (userRole === 3) {
    // Manager (3): Retrieve own leave requests + leave requests of employees they manage
    const managedEmployees = await User.find({ managerId: userId }).select('_id');
    const managedEmployeeIds = managedEmployees.map(emp => emp._id);

    leaves = await Leave.find({
      $or: [
        { employeeId: userId }, // Own leave requests
        { employeeId: { $in: managedEmployeeIds } } // Leave requests of managed employees
      ]
    });
  } else {
    // Other roles: Retrieve only own leave requests
    leaves = await Leave.find({ employeeId: userId });
  }

  // Add a professional message to each leave request and format the dates in Indian format
  const leavesWithMessages = leaves.map(leave => {
    let approvalMessage = '';

    const formattedStartDate = format(new Date(leave.startDate), 'dd-MM-yyyy');
    const formattedEndDate = format(new Date(leave.endDate), 'dd-MM-yyyy');
    const customStartDate = leave.customApprovedStartDate
      ? format(new Date(leave.customApprovedStartDate), 'dd-MM-yyyy')
      : null;
    const customEndDate = leave.customApprovedEndDate
      ? format(new Date(leave.customApprovedEndDate), 'dd-MM-yyyy')
      : null;

    if (leave.status === 'Approved') {
      if (leave.customApprovedStartDate && leave.customApprovedEndDate) {
        approvalMessage = `Your leave has been approved for the custom period from ${customStartDate} to ${customEndDate}.`;
      } else {
        approvalMessage = `Your leave has been fully approved from ${formattedStartDate} to ${formattedEndDate}.`;
      }
    } else if (leave.status === 'Pending') {
      approvalMessage = 'Your leave request is pending approval.';
    } else if (leave.status === 'Rejected') {
      approvalMessage = `Your leave request was rejected. Reason: ${leave.rejectionReason || 'No reason provided'}.`;
    }

    return {
      ...leave._doc, // Spread leave data into the new object
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      customApprovedStartDate: customStartDate,
      customApprovedEndDate: customEndDate,
      message: approvalMessage // Add the approval message
    };
  });

  return leavesWithMessages;
};

// Get leave requests for a manager, including their own and their employees' leave requests
exports.getLeaveRequestsForManager = async (managerId) => {
  return await Leave.find({
    $or: [
      { employeeId: managerId }, // Manager's own leave requests
      { approverId: managerId }   // Leave requests of employees managed by the manager
    ]
  });
};

exports.approveLeave = async (leaveId, approverId, customStartDate = null, customEndDate = null) => {
  const updateFields = { status: 'Approved', approverId };

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

  return leave;
};

exports.getLeaveById = async (leaveId) => {
  // Fetch leave by ID
  return await Leave.findById(leaveId).exec();
};