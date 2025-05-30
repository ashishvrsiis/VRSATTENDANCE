const attendanceRegularizationService = require('../services/attendanceRegularizationService');

class AttendanceRegularizationController {
  async getAttendanceList(req, res) {
    try {
      const user = req.user;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const status = req.query.status;
  
      const result = await attendanceRegularizationService.getAttendanceList(user, page, limit, status);
  
     const formattedData = result.data.map(attendance => {
  let plazaName = attendance.plazaName || 'N/A';
  let remarks = attendance.remarks;

  // Check if it's OutOfRange and extract the plaza from remarks
  if (attendance.leaveType === 'OutOfRange' && typeof remarks === 'string') {
    const match = remarks.match(/Last known plaza:\s*(.*)$/i);
    if (match) {
      plazaName = match[1]?.trim() || plazaName;
      remarks = remarks.replace(/Last known plaza:\s*.*$/i, '').trim(); // remove plaza info from remarks
    }
  }

  return {
    ...attendance,
    regularizationType: attendance.leaveType,
    employeeName: attendance.user?.name || 'Unknown',
    plazaName,
    remarks
  };
});
  
      res.status(200).json({
        records: formattedData,
        pagination: result.pagination
      });
    } catch (error) {
      console.error('Error in getAttendanceList controller:', error);
      res.status(500).json({ error: 'Error fetching attendance list', details: error.message });
    }
  }
  
  async applyAttendanceRegularization(req, res) {
    try {
        const { approverName, startDate, endDate, remarks, regularizationType, plazaName } = req.body;
        const attendance = await attendanceRegularizationService.applyAttendanceRegularization({
            approverName,
            startDate,
            endDate,
            remarks,
            leaveType: regularizationType, // Transform regularizationType to leaveType
            plazaName,
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

    console.log('Authenticated user:', req.user);
    
    try {
      const { id } = req.params;
      const { status, reason } = req.body; // Get status and reason from the request body

      if (!req.user || !req.user.email) {
        return res.status(401).json({ error: 'User not authenticated or missing email.' });
    }

      const updatedAttendance = await attendanceRegularizationService.updateAttendanceStatus(id, status, req.user, reason);
      res.status(200).json(updatedAttendance);
    } catch (error) {
      res.status(500).json({ error: 'Error updating attendance status' });
    }
  }
}

module.exports = new AttendanceRegularizationController();
