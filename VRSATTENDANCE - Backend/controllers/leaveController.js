const leaveService = require('../services/leaveService');
const userService = require('../services/userService');
const mongoose = require('mongoose');

exports.createLeave = async (req, res) => {
  try {
      const userId = req.user.userId; // Use req.user.userId instead of req.user._id
      const leaveData = req.body; // Get the leave data from the request body

      // Pass userId and leaveData to the service
      const leave = await leaveService.createLeave(userId, leaveData);
      res.status(201).json(leave);
  } catch (error) {
      res.status(500).json({ error: error.message });
  }
};

exports.getLeaveRequests = async (req, res) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Fetch the leave requests along with their messages
    const leaves = await leaveService.getLeaveRequests(userId, userRole);

    if (!leaves.length) {
      return res.status(404).json({ message: 'No leave requests found' });
    }

    // Send the leave requests and their messages in the response
    res.status(200).json(leaves);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// Leave approval logic
exports.approveLeave = async (req, res) => {
  try {
    const leaveId = req.params.leaveId;
    const approverId = req.user.userId;
    const approverRole = req.user.role;

    const { customStartDate, customEndDate } = req.body;

    // Fetch the leave details using leaveId
    const leave = await leaveService.getLeaveById(leaveId);
    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Get the employee details to check the manager relationship
    const employee = await userService.getUserById(leave.employeeId);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Allow only Super admins (1), admins (2), or managers (role 3 if they are the manager)
    if (![1, 2].includes(approverRole) && (!employee.managerId || employee.managerId.toString() !== approverId.toString())) {
      return res.status(403).json({ message: 'Unauthorized to approve this leave' });
    }

    // Validate custom approval dates are within the applied leave range
    if (customStartDate && customEndDate) {
      if (new Date(customStartDate) < new Date(leave.startDate) || new Date(customEndDate) > new Date(leave.endDate)) {
        return res.status(400).json({ message: 'Custom date range is outside the applied leave range' });
      }
    }

    // Perform the approval
    const updatedLeave = await leaveService.approveLeave(leaveId, approverId, customStartDate, customEndDate);

    // Generate the response message
    let approvalMessage = '';
    if (customStartDate && customEndDate) {
      approvalMessage = `Your leave has been approved for the custom period from ${customStartDate} to ${customEndDate}.`;
    } else {
      approvalMessage = `Your leave has been fully approved from ${leave.startDate.toISOString().split('T')[0]} to ${leave.endDate.toISOString().split('T')[0]}.`;
    }

    res.status(200).json({
      leave: updatedLeave,
      message: approvalMessage
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.rejectLeave = async (req, res) => {
  try {
    const leaveId = req.params.leaveId; // Get the leaveId from the URL parameter
    const approverId = req.user.userId; // Get the approver's user ID from the decoded JWT
    const approverRole = req.user.role; // Get the approver's role from the decoded JWT
    const { reason } = req.body; // Get the reason for rejection

    if (!reason) {
      return res.status(400).json({ message: 'Rejection reason is required' });
    }

    // Fetch the leave details using leaveId
    const leave = await leaveService.getLeaveById(leaveId);
    if (!leave) {
      return res.status(404).json({ message: 'Leave not found' });
    }

    // Get the employee details to check the manager relationship
    const employee = await userService.getUserById(leave.employeeId);

    // Check if the employee exists
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    // Allow only Super admins (1), admins (2), or managers (by checking if approverId is the managerId)
    if (![1, 2].includes(approverRole) && (!employee.managerId || employee.managerId.toString() !== approverId.toString())) {
      return res.status(403).json({ message: 'Unauthorized to reject this leave' });
    }

    // Perform the rejection
    const updatedLeave = await leaveService.rejectLeave(leaveId, approverId, reason);
    res.status(200).json(updatedLeave);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};