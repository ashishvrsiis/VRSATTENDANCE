const mongoose = require('mongoose');
const Attendance = require('../models/Attendance');
const moment = require('moment');
const momentRange = require('moment-range');
momentRange.extendMoment(moment);
const User = require('../models/User');
const attendanceRegularizationService = require('../services/attendanceRegularizationService');
const Toll = require('../models/tollModel');

exports.getTodayAttendance = async (userId, date) => {
    try {
        console.log('Querying for userId:', userId, 'and date:', date); // Log query parameters

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

    // Handle attendance regularization if not within 1 km range
    if (!withinRange) {
        await attendanceRegularizationService.applyAttendanceRegularization({
            approverName: 'System',
            startDate: today,
            endDate: today,
            remarks: 'Attendance marked outside the toll plaza range',
            leaveType: 'OutOfRange', // Provide a valid leaveType here
            regularizationType: 'Out of range',
            userId,
        });
        return { message: `Shift ${status} marked successfully. Please regularize your attendance as it is outside the toll plaza range.` };
    }

    return { message: `Shift ${status} marked successfully.` };
};

exports.getAttendanceByDateRange = async (userId, startDate, endDate) => {
    try {
        console.log(`Fetching attendance records for userId: ${userId}, date range: ${startDate} to ${endDate}`);

        // Convert userId to ObjectId
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // Fetch attendance records for the given user and date range
        const records = await Attendance.find({
            userId: userObjectId,
            date: { $gte: startDate, $lte: endDate }
        }).lean(); // Use .lean() for better performance

        console.log('Fetched records from the database:', JSON.stringify(records, null, 2));

        // Get the current date and time for comparison
        const currentDateTime = moment();

        // Format the attendance records with present/absent status and total working hours
        const formattedRecords = records.map(record => {
            const shiftStartMarked = !!record.punchIn;
            const shiftEndMarked = !!record.punchOut;

            // Check if the record's date is today and if it's before or after the end of the day
            const recordDate = moment(record.date);
            const isToday = recordDate.isSame(currentDateTime, 'day');
            const isBeforeEndOfDay = isToday && currentDateTime.isBefore(recordDate.endOf('day'));

            // Calculate present/absent status based on the provided logic
            let present;
            if (shiftStartMarked) {
                // Mark as present if the shift has started, regardless of punch out status
                present = 'Yes';
            } else {
                // Mark as absent if no shift start and it's after end of day
                present = isBeforeEndOfDay ? 'No' : 'Yes';
            }

            const absent = present === 'No' ? 'Yes' : 'No';

            // Calculate total working hours
            let totalWorkingHours;
            if (shiftStartMarked && shiftEndMarked) {
                // Calculate the difference between punchIn and punchOut
                const punchInTime = moment(record.punchIn);
                const punchOutTime = moment(record.punchOut);
                totalWorkingHours = moment.duration(punchOutTime.diff(punchInTime)).humanize();
            } else if (shiftStartMarked && !shiftEndMarked) {
                totalWorkingHours = 'Shift not marked end';
            } else {
                totalWorkingHours = 'No working hours';
            }

            return {
                date: record.date,
                punchIn: record.punchIn ? record.punchIn.toISOString() : null,
                punchOut: record.punchOut ? record.punchOut.toISOString() : null,
                shift_start_marked: shiftStartMarked,
                shift_end_marked: shiftEndMarked,
                image: record.image ? `data:image/jpeg;base64,${record.image}` : '', // Include base64 image
                present, // Add present status
                absent, // Add absent status
                totalWorkingHours // Add total working hours
            };
        });

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

        // Fetch attendance records for the given user and date range
        const records = await Attendance.find({
            userId: userObjectId,
            date: { $gte: startDate, $lte: endDate }
        }).lean();

        console.log('Fetched records from the database:', JSON.stringify(records, null, 2));

        // Format the attendance records with present/absent status and total working hours
        const formattedRecords = records.map(record => {
            const shiftStartMarked = !!record.punchIn;
            const shiftEndMarked = !!record.punchOut;
            const present = shiftStartMarked ? 'Yes' : 'No';
            const absent = present === 'No' ? 'Yes' : 'No';

            let totalWorkingHours;
            if (shiftStartMarked && shiftEndMarked) {
                const punchInTime = moment(record.punchIn);
                const punchOutTime = moment(record.punchOut);
                totalWorkingHours = moment.duration(punchOutTime.diff(punchInTime)).humanize();
            } else if (shiftStartMarked && !shiftEndMarked) {
                totalWorkingHours = 'Shift not marked end';
            } else {
                totalWorkingHours = 'No working hours';
            }

            return {
                date: record.date,
                punchIn: record.punchIn ? record.punchIn.toISOString() : null,
                punchOut: record.punchOut ? record.punchOut.toISOString() : null,
                shift_start_marked: shiftStartMarked,
                shift_end_marked: shiftEndMarked,
                present,
                absent,
                totalWorkingHours
            };
        });

        return formattedRecords;
    } catch (error) {
        console.error('Error fetching attendance by date range:', error);
        throw new Error('Error fetching attendance history');
    }
};