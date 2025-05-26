const AttendanceRegularization = require('../models/AttendanceRegularization');
const User = require('../models/User');

class AttendanceRegularizationService {
  async getAttendanceList(user, page = 1, limit = 10, status = null) {
    try {
      let filter = {};
      const skip = (page - 1) * limit;
      console.log('Start of getAttendanceList');
  
      // Log the user details
      console.log('User Info:', JSON.stringify(user, null, 2));
  
      // Determine the filter based on the user's role
      if (user.role === 1 || user.role === 2) {
        console.log('User is admin or super admin. Fetching all attendance records.');
        filter = {}; // No restrictions for admin/super admin
      } else if (user.role === 3) { // Role is manager
        console.log('User is a manager. Checking managed users and direct reports.');
  
        if (user.manager) {
          // Fetch users directly managed by the current manager
          const managedUsers = await User.find({ managerId: user.userId }); // Fetch direct reports
  
          console.log('Managed Users:', JSON.stringify(managedUsers, null, 2));
  
          if (managedUsers.length > 0) {
            console.log('Manager has direct reports. Fetching records for managed users.');
            filter = { user: { $in: managedUsers.map(u => u._id) } }; // Records for direct reports
          } else {
            console.log('Manager has no managed users. Fetching own attendance records.');
            filter = { user: user.userId }; // Manager's own records
          }
        } else {
          console.log('User is not a valid manager. No records available.');
          return { data: [], pagination: { total: 0, page, limit, totalPages: 0 } };
        }
      }
  
      if (status) {
        filter.status = status;
      }
      
      console.log('Filter Applied:', JSON.stringify(filter, null, 2));
  
      // Fetch attendance records with detailed population
      const [totalCount, attendanceRecords] = await Promise.all([
        AttendanceRegularization.countDocuments(filter),
        AttendanceRegularization.find(filter)
          .populate({
            path: 'user',
            select: 'name email managerId plazaName',
            populate: { path: 'managerId', select: 'name email _id' }
          })
          .sort({ startDate: -1 })
          .skip(skip)
          .limit(limit)
      ]);
  
      console.log('Fetched Attendance Records:', JSON.stringify(attendanceRecords, null, 2)); 
  
      // Enhance records with manager details
      const enhancedRecords = attendanceRecords.map(record => {
        const user = record.user;
        const manager = user ? user.managerId : null;
  
        console.log('Processing Record:', JSON.stringify(record, null, 2));
        console.log('User Info:', JSON.stringify(user, null, 2));
        console.log('Manager Info:', JSON.stringify(manager, null, 2));
  
        return {
          ...record.toObject(),
          managerId: manager ? manager._id : null,
          managerName: manager ? manager.name : 'N/A',
          managerEmail: manager ? manager.email : 'N/A',
          plazaName: record.plazaName || 'N/A',
        };
      });
  
      console.log('Enhanced Records:', JSON.stringify(enhancedRecords, null, 2));
      return {
        data: enhancedRecords,
        pagination: {
          total: totalCount,
          page,
          limit,
          totalPages: Math.ceil(totalCount / limit)
        }
      };
    } catch (error) {
      console.error('Error in getAttendanceList service:', error);
      throw new Error('Error fetching attendance list');
    }
  }

  async applyAttendanceRegularization(data) {
    // Ensure the `user` field is correctly set
    const attendance = new AttendanceRegularization({
        ...data,
        user: data.userId // Set the user field as a reference to the User model
    });
    return attendance.save();
}

  async updateAttendanceStatus(id, status, user, reason) {

    if (!user || !user.email) {
      throw new Error('Authenticated user information is required.');
  }

    const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    // Ensure the authenticated user owns the attendance record
    return AttendanceRegularization.findOneAndUpdate(
      { _id: id, userId: user.id },
      { status, reason, approvedBy: user.email }, // Include reason if provided
      { new: true }
    );
  }
}

module.exports = new AttendanceRegularizationService();
