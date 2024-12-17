const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const moment = require('moment');
const momentRange = require('moment-range');
momentRange.extendMoment(moment);
const User = require('../models/User');
const attendanceRegularizationService = require('../services/attendanceRegularizationService');
const Toll = require('../models/tollModel');
const RecentActivity = require('../models/RecentActivity');
const AttendanceRegularization = require('../models/AttendanceRegularization');
const PDFDocument = require('pdfkit');
const fs = require('fs');


exports.getTodayAttendance = async (userId, date) => {
    try {
        console.log('Querying for userId:', userId, 'and date:', date); // Log query parameters

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        // Convert userId to ObjectId
        const userObjectId = new mongoose.Types.ObjectId(userId);

        const attendance = await Attendance.find({ userId: userObjectId, date: date });
        console.log('Found attendance records:', attendance); // Log found records
        return attendance;
    } catch (error) {
        console.error('Error in getTodayAttendance:', error.message);
        throw new Error('Error fetching today\'s attendance');
    }
};

exports.getMonthlyAttendance = async (userId, startOfMonth, endOfMonth) => {
    try {
        console.log(`Fetching attendance records for userId: ${userId}, date range: ${startOfMonth} to ${endOfMonth}`);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

        // Fetch attendance records for the given user and date range
        const records = await Attendance.find({
            userId,
            date: { $gte: startOfMonth, $lte: endOfMonth }
        }).lean(); // Use .lean() for better performance

        console.log('Fetched records from the database:', JSON.stringify(records, null, 2));

        const formattedRecords = records.map(record => ({
            date: record.date,
            shift_start_marked: !!record.punchIn,
            shift_end_marked: !!record.punchOut
        }));

        console.log('Formatted attendance records:', JSON.stringify(formattedRecords, null, 2));

        return formattedRecords;
    } catch (error) {
        console.error('Error fetching monthly attendance:', error);
        throw new Error('Error fetching monthly attendance');
    }
};

exports.getWeeklyAttendance = async (userId, startOfWeek, endOfWeek) => {
    try {
        console.log(`Fetching attendance records for userId: ${userId}, date range: ${startOfWeek} to ${endOfWeek}`);

        // Fetch attendance records for the given user and date range
        const records = await Attendance.find({
            userId,
            date: { $gte: startOfWeek, $lte: endOfWeek }
        }).lean();

        console.log('Fetched records from the database:', JSON.stringify(records, null, 2));

        // Format attendance records and calculate worked seconds
        const formattedRecords = records.map(record => ({
            date: record.date,
            shift_start_marked: !!record.punchIn,
            shift_end_marked: !!record.punchOut,
            worked_seconds: record.punchIn && record.punchOut
                ? moment(record.punchOut).diff(moment(record.punchIn), 'seconds') // Calculate worked time in seconds
                : 0
        }));

        console.log('Formatted weekly attendance records:', JSON.stringify(formattedRecords, null, 2));

        return formattedRecords;
    } catch (error) {
        console.error('Error fetching weekly attendance:', error);
        throw new Error('Error fetching weekly attendance');
    }
};

const getDistanceFromLatLonInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371; // Radius of Earth in kilometers
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
};

exports.markAttendance = async (userId, today, status, data) => {
    console.log(`markAttendance called with userId: ${userId}, date: ${today}, status: ${status}, data:`, data);

    const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field

    // Validate status
    if (status !== 'start' && status !== 'end') {
        console.log('Error: Invalid status provided.');
        throw new Error('Invalid status. Only "start" or "end" are allowed.');
    }

    // Fetch toll plaza data from the database
    const tollPlazas = await Toll.find({});
    console.log('Fetched toll plaza data from database:', tollPlazas);

    // Check if the location is within 1 km of any toll plaza
    let withinRange = false;
    const userLat = parseFloat(data.latitude);
    const userLon = parseFloat(data.longitude);

    for (const plaza of tollPlazas) {
        const plazaLat = parseFloat(plaza.Latitude);
        const plazaLon = parseFloat(plaza.Longitude);

        const distance = getDistanceFromLatLonInKm(userLat, userLon, plazaLat, plazaLon);
        console.log(`Distance to ${plaza.LocationName}: ${distance} km`);

        if (distance <= 1) {
            withinRange = true;
            break; // No need to check further if within range
        }
    }

    // Find the latest attendance record for the user on the current day
    let attendance = await Attendance.findOne({ userId, date: today }).sort({ createdAt: -1 });
    console.log('Found attendance record:', attendance);

    if (status === 'start') {
        if (attendance && !attendance.punchOut) {
            console.log('Error: An active shift is already started and not ended.');
            throw new Error('You must end the current shift before starting a new one.');
        }

        if (!attendance || (attendance && attendance.punchOut)) {
            attendance = new Attendance({
                userId,
                date: today,
                punchIn: new Date(),
                ...data
            });
            console.log('Created new attendance record:', attendance);
        } else {
            attendance.punchIn = new Date();
            Object.assign(attendance, data);
            console.log('Updated existing attendance record for start:', attendance);
        }

    } else if (status === 'end') {
        if (!attendance || !attendance.punchIn || attendance.punchOut) {
            console.log('Error: No active shift started or shift already ended.');
            throw new Error('You must start a shift before ending it.');
        }

        attendance.punchOut = new Date();
        console.log('Updated existing attendance record for end:', attendance);
    }

    // Save the attendance record
    await attendance.save();
    console.log('Attendance saved successfully.');

    // Check if attendance is out of range
    if (!withinRange) {
        // Check for an existing "OutOfRange" regularization for the current date
        const existingRegularization = await AttendanceRegularization.findOne({
            userId,
            startDate: today,
            endDate: today,
            regularizationType: 'Out of range',
        });

        // Only apply regularization if it does not already exist
        if (!existingRegularization) {
            await attendanceRegularizationService.applyAttendanceRegularization({
                approverName: 'System',
                startDate: today,
                endDate: today,
                remarks: 'Attendance marked outside the toll plaza range',
                leaveType: 'OutOfRange', // Provide a valid leaveType here
                regularizationType: 'Out of range',
                userId,
            });
            console.log('Out-of-range attendance regularization applied.');
        }

        // Add a recent activity for attendance outside range if it’s punch-in or punch-out
        const recentActivity = new RecentActivity({
            userId,
            activity: `Attendance marked outside the toll plaza range for ${today}.`, // Set the `activity` field to a descriptive message
            timestamp: new Date()
        });
        await recentActivity.save();
        console.log('Recent activity for out-of-range attendance saved successfully.');

        return { message: `Shift ${status} marked successfully. Please regularize your attendance as it is outside the toll plaza range.` };
    }

    return { message: `Shift ${status} marked successfully.` };
};

exports.getAttendanceByDateRange = async (userId, startDate, endDate) => {
    try {
        console.log(`Fetching attendance records for userId: ${userId}, date range: ${startDate} to ${endDate}`);

        // Convert userId to ObjectId
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Fetch attendance records for the given date range
        const records = await Attendance.find({
            userId: userObjectId,
            date: { $gte: startDate, $lte: endDate }
        }).lean();

        // Fetch regularization data where status is 'Approved'
        const regularizations = await AttendanceRegularization.find({
            user: userObjectId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
            status: 'Approved'
        }).lean();

        // Map regularization dates for quick lookup
        const regularizedDates = new Set();
        regularizations.forEach(reg => {
            const current = moment(reg.startDate);
            const end = moment(reg.endDate);
            while (current.isSameOrBefore(end)) {
                regularizedDates.add(current.format('YYYY-MM-DD'));
                current.add(1, 'days');
            }
        });

        console.log('Regularized Dates:', Array.from(regularizedDates));

        // Prepare attendance records map for quick lookup
        const attendanceMap = {};
        records.forEach(record => {
            const recordDate = moment(record.date).format('YYYY-MM-DD');
            attendanceMap[recordDate] = record;
        });

        // Generate a full date range between startDate and endDate
        const fullDateRange = [];
        const start = moment(startDate);
        const end = moment(endDate);
        while (start.isSameOrBefore(end)) {
            fullDateRange.push(start.format('YYYY-MM-DD'));
            start.add(1, 'days');
        }

        console.log('Full Date Range:', fullDateRange);

        // Format and combine attendance and regularization data
        const currentDateTime = moment();
        const formattedRecords = fullDateRange.map(date => {
            const record = attendanceMap[date];
            const isRegularized = regularizedDates.has(date);

            let present, absent, totalWorkingHours;

            if (record) {
                // Attendance data exists
                const shiftStartMarked = !!record.punchIn;
                const shiftEndMarked = !!record.punchOut;

                if (isRegularized) {
                    present = 'Attendance Regularized';
                } else if (shiftStartMarked) {
                    present = 'Yes';
                } else {
                    const isToday = moment(date).isSame(currentDateTime, 'day');
                    present = isToday && currentDateTime.isBefore(moment(date).endOf('day')) ? 'No' : 'Yes';
                }

                absent = present === 'No' ? 'Yes' : 'No';

                if (shiftStartMarked && shiftEndMarked) {
                    const punchInTime = moment(record.punchIn);
                    const punchOutTime = moment(record.punchOut);
                    totalWorkingHours = moment.duration(punchOutTime.diff(punchInTime)).humanize();
                } else if (shiftStartMarked && !shiftEndMarked) {
                    totalWorkingHours = 'Shift not marked end';
                } else {
                    totalWorkingHours = isRegularized ? 'Attendance Regularized' : 'No working hours';
                }

                return {
                    date: record.date,
                    punchIn: record.punchIn ? record.punchIn.toISOString() : null,
                    punchOut: record.punchOut ? record.punchOut.toISOString() : null,
                    shift_start_marked: shiftStartMarked,
                    shift_end_marked: shiftEndMarked,
                    image: record.image ? `data:image/jpeg;base64,${record.image}` : '', // Include base64 image
                    present,
                    absent,
                    totalWorkingHours
                };
            } else if (isRegularized) {
                // Attendance not marked, but regularized
                return {
                    date: date,
                    punchIn: null,
                    punchOut: null,
                    shift_start_marked: false,
                    shift_end_marked: false,
                    present: 'Attendance Regularized',
                    absent: 'No',
                    totalWorkingHours: 'Attendance Regularized'
                };
            } else {
                // Attendance not marked and not regularized
                return {
                    date: date,
                    punchIn: null,
                    punchOut: null,
                    shift_start_marked: false,
                    shift_end_marked: false,
                    present: 'No',
                    absent: 'Yes',
                    totalWorkingHours: 'No working hours'
                };
            }
        });

        console.log('Final Formatted Records:', JSON.stringify(formattedRecords, null, 2));
        return formattedRecords;

    } catch (error) {
        console.error('Error fetching attendance by date range:', error);
        throw new Error('Error fetching attendance history');
    }
};

exports.retrieveAttendanceHistoryByDateRange = async (userId, startDate, endDate) => {
    try {
        console.log(`Fetching attendance records for userId: ${userId}, date range: ${startDate} to ${endDate}`);

        // Convert userId to ObjectId
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Fetch managers with role = 3 (if needed for additional processing)
        const managers = await User.find({ role: 3 });
        console.log('Managers:', managers);

        // Fetch attendance records for the given user and date range
        const records = await Attendance.find({
            userId: userObjectId,
            date: { $gte: startDate, $lte: endDate }
        }).lean();

        console.log('Fetched attendance records:', JSON.stringify(records, null, 2));

        // Fetch regularization data where status is 'Approved'
        const regularizations = await AttendanceRegularization.find({
            user: userObjectId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
            status: 'Approved'
        }).lean();

        // Map regularization dates for quick lookup
        const regularizedDates = new Set();
        regularizations.forEach(reg => {
            const current = moment(reg.startDate);
            const end = moment(reg.endDate);
            while (current.isSameOrBefore(end)) {
                regularizedDates.add(current.format('YYYY-MM-DD'));
                current.add(1, 'days');
            }
        });

        console.log('Regularized Dates:', Array.from(regularizedDates));

        // Current date for comparison
        const currentDateTime = moment();

        // Format attendance records
        const formattedRecords = records.map(record => {
            const shiftStartMarked = !!record.punchIn;
            const shiftEndMarked = !!record.punchOut;

            const recordDate = moment(record.date).format('YYYY-MM-DD');
            const isRegularized = regularizedDates.has(recordDate);

            // Determine "present" status
            let present;
            if (isRegularized) {
                present = 'Attendance Regularized';
            } else if (shiftStartMarked) {
                present = 'Yes';
            } else {
                const isToday = moment(record.date).isSame(currentDateTime, 'day');
                present = isToday && currentDateTime.isBefore(moment(record.date).endOf('day')) ? 'No' : 'Yes';
            }

            const absent = present === 'No' ? 'Yes' : 'No';

            // Calculate total working hours
            let totalWorkingHours;
            if (shiftStartMarked && shiftEndMarked) {
                const punchInTime = moment(record.punchIn);
                const punchOutTime = moment(record.punchOut);
                totalWorkingHours = moment.duration(punchOutTime.diff(punchInTime)).humanize();
            } else if (shiftStartMarked && !shiftEndMarked) {
                totalWorkingHours = 'Shift not marked end';
            } else {
                totalWorkingHours = isRegularized ? 'Attendance Regularized' : 'No working hours';
            }

            return {
                date: record.date,
                punchIn: record.punchIn ? record.punchIn.toISOString() : null,
                punchOut: record.punchOut ? record.punchOut.toISOString() : null,
                shift_start_marked: shiftStartMarked,
                shift_end_marked: shiftEndMarked,
                image: record.image ? `data:image/jpeg;base64,${record.image}` : '', // Include base64 image
                present, // Add attendance regularization status
                absent,
                totalWorkingHours
            };
        });

        // Check for dates with regularization but no attendance record
        const allDates = new Set();
        for (let date = moment(startDate); date.isSameOrBefore(endDate); date.add(1, 'days')) {
            allDates.add(date.format('YYYY-MM-DD'));
        }

        const attendanceDates = new Set(formattedRecords.map(record => moment(record.date).format('YYYY-MM-DD')));

        // Add missing regularized dates
        regularizedDates.forEach(date => {
            if (!attendanceDates.has(date)) {
                formattedRecords.push({
                    date: date,
                    punchIn: null,
                    punchOut: null,
                    shift_start_marked: false,
                    shift_end_marked: false,
                    image: '',
                    present: 'Attendance Regularized',
                    absent: 'No',
                    totalWorkingHours: 'Attendance Regularized'
                });
            }
        });

        // Sort records by date
        formattedRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

        console.log('Final formatted records:', JSON.stringify(formattedRecords, null, 2));

        return formattedRecords;
    } catch (error) {
        console.error('Error fetching attendance by date range:', error);
        throw new Error('Error fetching attendance history');
    }
};

exports.generateAttendanceReportPDF = async (startDate, endDate, res) => {
    try {
        // Fetch all users from the database
        const users = await User.find({});  // Assumes a User model is defined

        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found' });
        }

        console.log('Found users:', users);

        const managers = await User.find({ role: 3 });
        console.log(managers); // All managers with the updated 'manager' field


        // Create a new PDF document for all users
        const doc = new PDFDocument();

        // Set the correct content type and disposition to make it downloadable
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${moment().format('YYYYMMDDHHmmss')}.pdf`);

        // Pipe the document to the response stream (not to a file)
        doc.pipe(res);

        // Document metadata
        doc.info.Title = 'Attendance History Report';
        doc.info.Author = 'Your Application';

        // Add a title to the PDF
        doc.fontSize(18).text('Attendance History Report', { align: 'center' });
        doc.moveDown();

        // Loop through each user and generate their report
        for (const user of users) {
            const userId = user._id.toString();

            // Fetch attendance data for the user
            const attendanceRecords = await this.getAttendanceByDateRange(userId, startDate, endDate);

            if (!attendanceRecords || attendanceRecords.length === 0) {
                console.log(`No attendance records found for user: ${userId}`);
                continue;  // Skip this user if there are no attendance records
            }

            // Add user name and date range to the PDF
            doc.fontSize(12).text(`User: ${user.name}`, { align: 'center' });
            doc.text(`Report for: ${moment(startDate).format('MMMM Do, YYYY')} to ${moment(endDate).format('MMMM Do, YYYY')}`, { align: 'center' });
            doc.moveDown(2);

            // Table headers
            doc.fontSize(10).text('Date', 50, doc.y, { width: 100, align: 'left' });
            doc.text('Punch In', 150, doc.y, { width: 100, align: 'left' });
            doc.text('Punch Out', 250, doc.y, { width: 100, align: 'left' });
            doc.text('Present', 350, doc.y, { width: 100, align: 'left' });
            doc.text('Absent', 450, doc.y, { width: 100, align: 'left' });
            doc.text('Working Hours', 550, doc.y, { width: 100, align: 'left' });
            doc.moveDown();

            // Draw line under header
            doc.moveTo(50, doc.y).lineTo(560, doc.y).stroke();
            doc.moveDown();

            // Loop through each record and add to the table
            attendanceRecords.forEach(record => {
                const { date, punchIn, punchOut, present, absent, totalWorkingHours } = record;

                doc.text(moment(date).format('YYYY-MM-DD'), 50, doc.y, { width: 100 });
                doc.text(punchIn ? moment(punchIn).format('HH:mm:ss') : 'N/A', 150, doc.y, { width: 100 });
                doc.text(punchOut ? moment(punchOut).format('HH:mm:ss') : 'N/A', 250, doc.y, { width: 100 });
                doc.text(present, 350, doc.y, { width: 100 });
                doc.text(absent, 450, doc.y, { width: 100 });
                doc.text(totalWorkingHours, 550, doc.y, { width: 100 });
                doc.moveDown();
            });

            doc.addPage();  // Start a new page for the next user
        }

        // Finalize the document
        doc.end();

        console.log('PDF report generated and sent to the frontend');
    } catch (error) {
        console.error('Error generating PDF reports:', error);
        res.status(500).json({ message: 'Failed to generate PDF reports' });
    }
};