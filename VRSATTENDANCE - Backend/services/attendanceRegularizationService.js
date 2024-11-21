const AttendanceRegularization = require('../models/AttendanceRegularization');
const User = require('../models/User');

class AttendanceRegularizationService {
  async getAttendanceList(user) {
    try {
      let filter = {};
      console.log('Start of getAttendanceList');

      // Log the user details
      console.log('User Info:', JSON.stringify(user, null, 2));

      const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


      // Determine the filter based on the user's role
      if (user.role === 1 || user.role === 2) {
        console.log('User is admin or super admin. Fetching all attendance records.');
        filter = {};
      } else if (user.role === 3) {
        console.log('User is manager or regular user. Checking managed users.');
        const manager = await User.findOne({ _id: user.id }).populate('managedUsers');
        console.log('Manager Info:', JSON.stringify(manager, null, 2));

        if (manager && manager.managedUsers && manager.managedUsers.length > 0) {
          console.log('Manager has managed users. Fetching records for managed users.');
          filter = { user: { $in: manager.managedUsers.map(u => u._id) } };
        } else {
          console.log('Manager has no managed users. Fetching own records.');
          filter = { user: user.id };
        }
      }

      console.log('Filter Applied:', JSON.stringify(filter, null, 2));

      // Fetch attendance records with detailed population
      const attendanceRecords = await AttendanceRegularization.find(filter)
        .populate({
          path: 'user',
          select: 'name email managerId',
          populate: {
            path: 'managerId',
            select: 'name email _id',
          },
        })
        .sort({ startDate: -1 });

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
        };
      });

      console.log('Enhanced Records:', JSON.stringify(enhancedRecords, null, 2));
      return enhancedRecords;
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

    const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    // Ensure the authenticated user owns the attendance record
    return AttendanceRegularization.findOneAndUpdate(
      { _id: id, userId: user.id },
      { status, reason }, // Include reason if provided
      { new: true }
    );
  }
}

module.exports = new AttendanceRegularizationService();
