const AttendanceRegularization = require('../models/AttendanceRegularization');

class AttendanceRegularizationService {
  async getAttendanceList(user) {
    let filter = {};

    if (user.role === 1 || user.role === 2) {
        // If super admin or admin, fetch all attendance records
        filter = {}; // No filter needed for super admin or admin
    } else if (user.role === 3) {
        // If user, check if they are a manager
        const manager = await User.findOne({ _id: user.id }).populate('managedUsers'); // Populate the users they manage

        if (manager && manager.managedUsers && manager.managedUsers.length > 0) {
            // User is a manager, fetch attendance records for users they manage
            filter = { user: { $in: manager.managedUsers.map(u => u._id) } };
        } else {
            // User is not a manager, fetch only their own attendance records
            filter = { user: user.id };
        }
    }

    return AttendanceRegularization.find(filter) // Apply the filter based on the user's role
        .populate('user', 'name') // Populate the `name` field from the User model
        .sort({ startDate: -1 });
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
    // Ensure the authenticated user owns the attendance record
    return AttendanceRegularization.findOneAndUpdate(
      { _id: id, userId: user.id },
      { status, reason }, // Include reason if provided
      { new: true }
    );
  }
}

module.exports = new AttendanceRegularizationService();
