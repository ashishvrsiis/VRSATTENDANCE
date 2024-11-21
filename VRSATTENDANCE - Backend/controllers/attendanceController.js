const moment = require('moment');
const attendanceService = require('../services/attendanceService');
const User = require('../models/User');

exports.getTodayAttendance = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { startDate, endDate, targetUserId } = req.query;
        const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
        console.log('Controller - userId:', userId); // Log userId
        console.log('Controller - today:', today); // Log today's date

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        if (!userId) {
            return res.status(400).json({ error: 'User ID is missing' });
        }

        const attendance = await attendanceService.getTodayAttendance(userId, today);
        res.json({ date: today, data: attendance });
    } catch (error) {
        console.error('Error in getTodayAttendance:', error.message);
        res.status(500).json({ error: error.message });
    }
};

exports.getMonthlyAttendance = async (req, res) => {
    try {

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

        // Verify the user ID from the token
        const userId = req.user.userId;
        if (!userId) {
            console.error('User ID is missing in the request.');
            return res.status(400).json({ error: 'User ID is missing.' });
        }

        // Calculate the start and end of the month
        const startOfMonth = moment().startOf('month').format('YYYY-MM-DD');
        const endOfMonth = moment().endOf('month').format('YYYY-MM-DD');
        console.log(`Fetching monthly attendance for userId: ${userId}`);
        console.log(`Date range: ${startOfMonth} to ${endOfMonth}`);

        // Fetch attendance records from the database
        const attendanceRecords = await attendanceService.getMonthlyAttendance(userId, startOfMonth, endOfMonth);
        console.log('Fetched records from the database:', JSON.stringify(attendanceRecords, null, 2));

        // Initialize the result array
        const result = [];

        // Process each record
        attendanceRecords.forEach(record => {
            console.log('Processing record:', JSON.stringify(record, null, 2));

            const { date, shift_start_marked, shift_end_marked } = record;
            const formattedDate = moment(date).format('YYYY-MM-DD');
            console.log('Formatted date:', formattedDate);

            // Find or create the entry for this date
            let existingEntry = result.find(entry => entry.date === formattedDate);

            if (existingEntry) {
                console.log('Updating existing entry:', JSON.stringify(existingEntry, null, 2));
                if (shift_start_marked) existingEntry.shift_start_marked = true;
                if (shift_end_marked) existingEntry.shift_end_marked = true;
            } else {
                console.log('Creating new entry for date:', formattedDate);
                result.push({
                    date: formattedDate,
                    shift_start_marked: !!shift_start_marked,
                    shift_end_marked: !!shift_end_marked
                });
            }
        });

        console.log('Resulting attendance records:', JSON.stringify(result, null, 2));
        res.json(result);
    } catch (error) {
        console.error('Error fetching monthly attendance:', error);
        res.status(500).json({ error: error.message });
    }
};

exports.markAttendance = async (req, res) => {
    const userId = req.user.userId;
    const { status, latitude, longitude, image } = req.body;
    const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format

    console.log('Controller - userId:', userId);
    console.log('Controller - today:', today);
    console.log('Controller - status:', status);
    console.log('Controller - data:', { latitude, longitude, image });

    const managers = await User.find({ role: 3 });
    console.log(managers); // All managers with the updated 'manager' field


    try {
        const response = await attendanceService.markAttendance(userId, today, status, { latitude, longitude, image });
        res.json(response);
    } catch (error) {
        console.error('Error in markAttendance:', error.message);
        res.status(400).json({ error: error.message });
    }
};

exports.getAttendanceHistory = async (req, res) => {
    try {
        const userId = req.user.userId;
        const { startDate, endDate } = req.query;

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        if (!userId) {
            return res.status(400).json({ error: 'User ID is missing.' });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Both startDate and endDate are required.' });
        }

        console.log(`Fetching attendance history for userId: ${userId}, from ${startDate} to ${endDate}`);

        // Fetch attendance history from service
        const attendanceRecords = await attendanceService.getAttendanceByDateRange(userId, startDate, endDate);

        // Send the response with the fetched records
        res.json(attendanceRecords);
    } catch (error) {
        console.error('Error in getAttendanceHistory:', error.message);
        res.status(500).json({ error: error.message });
    }
};

exports.retrieveAttendanceHistory = async (req, res) => {
    try {
        const currentUser = req.user; // Get the current user from the request
        const targetUserId = req.query.userId;
        const { startDate, endDate } = req.query;

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

        if (!targetUserId) {
            return res.status(400).json({ error: 'Target User ID is required.' });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Both startDate and endDate are required.' });
        }

        // Check if current user is an admin or a manager
        if (currentUser.role === 1 || currentUser.role === 2) {
            console.log('Admin access granted');
        } else if (currentUser.role === 3 && currentUser._id.toString() === targetUserId) {
            console.log('Manager access granted');
        } else {
            return res.status(403).json({ error: 'You do not have permission to access this attendance history.' });
        }

        // Fetch attendance history from service
        const attendanceRecords = await attendanceService.retrieveAttendanceHistoryByDateRange(targetUserId, startDate, endDate);

        // Send the response with the fetched records
        res.json(attendanceRecords);
    } catch (error) {
        console.error('Error in retrieveAttendanceHistory:', error.message);
        res.status(500).json({ error: error.message });
    }
};

exports.getAttendanceReportPDF = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

        if (!startDate || !endDate) {
            return res.status(400).json({ message: "Start date and end date are required" });
        }

        // Call the generateAttendanceReportPDF method from attendanceService
        await attendanceService.generateAttendanceReportPDF(startDate, endDate, res);
    } catch (error) {
        console.error("Error generating attendance report PDF:", error);
        res.status(500).json({ message: "Failed to generate attendance report PDF" });
    }
};

exports.getAllUsersAttendanceHistory = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'Both startDate and endDate are required.' });
        }

        console.log(`Fetching attendance history for all users, from ${startDate} to ${endDate}`);

        // Retrieve all users from the database
        const users = await User.find({});
        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found' });
        }

        // Create a result object to store attendance records for each user
        const result = [];

        // Loop through each user and fetch their attendance history
        for (const user of users) {
            const userId = user._id.toString();
            const userName = user.name;
            const userEmail = user.email;

            // Fetch attendance data for the user within the date range
            const attendanceRecords = await attendanceService.getAttendanceByDateRange(userId, startDate, endDate);

            // Format the attendance data to include the user's name, email, and attendance image if available
            const formattedRecords = attendanceRecords.map(record => ({
                date: record.date,
                punchIn: record.punchIn ? moment(record.punchIn).format('HH:mm:ss') : 'N/A',
                punchOut: record.punchOut ? moment(record.punchOut).format('HH:mm:ss') : 'N/A',
                present: record.present,
                absent: record.absent,
                totalWorkingHours: record.totalWorkingHours,
                image: record.image || null, // Assumes `image` field in attendance record holds image URL/path
            }));

            result.push({
                userId,
                userName,
                userEmail,
                attendance: formattedRecords,
            });
        }

        // Send the response with attendance history for all users
        res.json(result);
    } catch (error) {
        console.error('Error fetching attendance history for all users:', error.message);
        res.status(500).json({ error: error.message });
    }
};