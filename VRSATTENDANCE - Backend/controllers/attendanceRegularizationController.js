const attendanceRegularizationService = require('../services/attendanceRegularizationService');

class AttendanceRegularizationController {
  async getAttendanceList(req, res) {
    try {
        const user = req.user; // The user object should be populated from the request (e.g., by authentication middleware)
        const attendanceList = await attendanceRegularizationService.getAttendanceList(user);

        res.status(200).json(attendanceList.map(attendance => ({
            ...attendance.toObject(),
            regularizationType: attendance.leaveType, // Map leaveType to regularizationType
            employeeName: attendance.user ? attendance.user.name : 'Unknown', // Provide default value if name is not available
        })));
    } catch (error) {
        res.status(500).json({ error: 'Error fetching attendance list' });
    }
}

  async applyAttendanceRegularization(req, res) {
    try {
        const { approverName, startDate, endDate, remarks, regularizationType } = req.body;
        const attendance = await attendanceRegularizationService.applyAttendanceRegularization({
            approverName,
            startDate,
            endDate,
            remarks,
            leaveType: regularizationType, // Transform regularizationType to leaveType
            userId: req.user.userId,
        });
        res.status(201).json({
            ...attendance.toObject(),
            regularizationType: attendance.leaveType, // Transform leaveType to regularizationType in response
        });
    } catch (error) {
        res.status(500).json({ error: 'Error applying attendance regularization' });
    }
}

  async updateAttendanceStatus(req, res) {
    try {
      const { id } = req.params;
      const { status, reason } = req.body; // Get status and reason from the request body
      const updatedAttendance = await attendanceRegularizationService.updateAttendanceStatus(id, status, req.user, reason);
      res.status(200).json(updatedAttendance);
    } catch (error) {
      res.status(500).json({ error: 'Error updating attendance status' });
    }
  }
}

module.exports = new AttendanceRegularizationController();
