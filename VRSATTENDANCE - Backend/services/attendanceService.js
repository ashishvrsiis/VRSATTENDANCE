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
const handlebars = require('handlebars');  // For template processing
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const ExcelJS = require('exceljs');


exports.getTodayAttendance = async (userId, date) => {
    try {
        console.log('Querying for userId:', userId, 'and date:', date); // Log query parameters

        // const managers = await User.find({ role: 3 });
        // console.log(managers); // All managers with the updated 'manager' field


        // Convert userId to ObjectId
        const userObjectId = new mongoose.Types.ObjectId(userId);

        const attendance = await Attendance.find(
            { userId: userObjectId, date: date },
            { image: 0 });
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
        console.log('Fetching users...');
        const users = await User.find({});
        console.log(`Total users found: ${users.length}`);

        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found' });
        }

        const templatePath = path.join(__dirname, '..', 'templates', 'AttendanceReportUI.html');
        console.log(`Template path: ${templatePath}`);
        let templateSource;
        try {
            templateSource = fs.readFileSync(templatePath, 'utf-8');
            console.log('Template loaded successfully.');
        } catch (templateError) {
            console.error('Error reading template file:', templateError);
            throw new Error('Template file not found or inaccessible.');
        }
        const template = handlebars.compile(templateSource);
        console.log('Template compiled.');

        const usersData = await Promise.all(users.map(async (user) => {
            console.log(`Fetching attendance for user: ${user.name} (ID: ${user._id})`);
            const attendanceRecords = await this.getAttendanceByDateRange(user._id.toString(), startDate, endDate).catch(err => {
                console.error(`Error fetching attendance for user ${user.name}:`, err);
                return [];
            });            console.log(`Total attendance records for ${user.name}: ${attendanceRecords.length}`);
            return {
                name: user.name,
                email: user.email,
                phone: user.phone,
                dateOfBirth: user.dateOfBirth,
                employeeId: user.employeeId,
                position: user.position,
                managerName: user.managerName,
                managerRole: user.managerRole,
                workLocation: user.workLocation,
                fatherName: user.fatherName,
                plazaName: user.plazaName,
                attendanceRecords: attendanceRecords.map((record, index) => ({
                    serialNo: index + 1,
                    date: record.date,
                    image: record.image,
                    punchIn: record.punchIn || 'N/A',
                    punchOut: record.punchOut || 'N/A',
                    totalWorkingHours: record.totalWorkingHours || 'N/A',
                }))
            };
        }));

        console.log('User data processed for report:', JSON.stringify(usersData, null, 2));
        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            users: usersData,
        };

        const htmlContent = template(reportData);
        console.log('HTML content generated.');

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        console.log('Generating PDF...');
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        console.log('Sending PDF response...');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${moment().format('YYYYMMDDHHmmss')}.pdf`);
        if (res.headersSent) {
            console.error('Response already sent.');
            return;
        }
        res.end(pdfBuffer);
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({ message: 'Failed to generate All PDF report' });
    }
};

exports.generateAttendanceReportExcel = async (startDate, endDate, res) => {
    try {
        const users = await User.find({});

        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found' });
        }

        const usersData = await Promise.all(users.map(async (user) => {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id.toString(), startDate, endDate);
            const regularizations = await AttendanceRegularization.find({
                user: user._id,
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

            return {
                name: user.name,
                email: user.email,
                phone: user.phone,
                dateOfBirth: user.dateOfBirth,
                employeeId: user.employeeId,
                position: user.position,
                managerName: user.managerName,
                managerRole: user.managerRole,
                workLocation: user.workLocation,
                fatherName: user.fatherName,
                plazaName: user.plazaName,
                attendanceRecords: attendanceRecords.map((record, index) => ({
                    serialNo: index + 1,
                    date: record.date,
                    punchIn: record.punchIn || 'N/A',
                    punchOut: record.punchOut || 'N/A',
                    totalWorkingHours: record.totalWorkingHours || 'N/A',
                    image: record.image || null,
                    isRegularized: regularizedDates.has(moment(record.date).format('YYYY-MM-DD')) ? 'Yes' : 'No',
                })),
            };
        }));

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Report');

        usersData.forEach((user, userIndex) => {
            // Add User Info Section Title
            const titleRow = worksheet.addRow(['User Info']);
            worksheet.mergeCells(`A${titleRow.number}:M${titleRow.number}`);
            titleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
            titleRow.alignment = { horizontal: 'center' };
            titleRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '25325F' },
            };

            // Add User Info Headers
            const userHeaders = [
                'Serial No',
                'Name',
                'Email',
                'Phone',
                'Date of Birth',
                'Employee ID',
                'Position',
                'Manager Name',
                'Manager Role',
                'Work Location',
                'Father Name',
                'Plaza Name',
            ];
            const userHeaderRow = worksheet.addRow(userHeaders);
            userHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            userHeaderRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'F7A832' },
            };
            userHeaderRow.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
            });

            // Add User Info Data
            const userInfoRow = worksheet.addRow([
                userIndex + 1,
                user.name,
                user.email,
                user.phone,
                user.dateOfBirth,
                user.employeeId,
                user.position,
                user.managerName,
                user.managerRole,
                user.workLocation,
                user.fatherName,
                user.plazaName,
            ]);
            userInfoRow.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
            });

            // Leave a blank row for separation
            worksheet.addRow([]);

            // Add Attendance Records Section Title
            const attendanceTitleRow = worksheet.addRow(['Attendance Records']);
            worksheet.mergeCells(`A${attendanceTitleRow.number}:E${attendanceTitleRow.number}`);
            attendanceTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
            attendanceTitleRow.alignment = { horizontal: 'center' };
            attendanceTitleRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '25325F' },
            };

            // Add Attendance Records Headers
            const attendanceHeaders = ['Date', 'Punch In', 'Punch Out', 'Total Working Hours', 'Regularized'];
            const attendanceHeaderRow = worksheet.addRow(attendanceHeaders);
            attendanceHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            attendanceHeaderRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'F7A832' },
            };
            attendanceHeaderRow.eachCell(cell => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' },
                };
            });

            // Add Attendance Records Data
            user.attendanceRecords.forEach(record => {
                const recordRow = worksheet.addRow([
                    record.date,
                    '',
                    record.punchIn,
                    record.punchOut,
                    record.totalWorkingHours,
                    record.isRegularized,
                ]);
            
                if (record.image) {
                    // Decode base64 image
                    const imageBuffer = Buffer.from(record.image.split(',')[1], 'base64');
            
                    // Add the image to the workbook
                    const imageId = workbook.addImage({
                        buffer: imageBuffer,
                        extension: 'jpeg',
                    });
            
                    // Set row height and column width
                    const rowHeight = 60; // Adjust as needed
                    const columnWidth = 15; // Adjust as needed
                    worksheet.getRow(recordRow.number).height = rowHeight;
                    worksheet.getColumn(2).width = columnWidth;
            
                    // Add the image to fit within the cell
                    worksheet.addImage(imageId, {
                        tl: { col: 1, row: recordRow.number - 1 }, // Adjust for zero-based index
                        br: { col: 2, row: recordRow.number }, // End column and row to fit the cell
                        editAs: 'oneCell',
                    });
                }
            });            

            // Leave a blank row after each user
            worksheet.addRow([]);
        });

        // Ensure headers are set before streaming the file
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${moment().format('YYYYMMDDHHmmss')}.xlsx`);

        // Write the Excel file directly to the response
        await workbook.xlsx.write(res);
        res.end(); // Ensure the response is properly closed
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ message: 'Failed to generate Excel report' });
    }
};

exports.generateCurrentUserAttendanceHistoryPDF = async (req, res) => {
    try {
        const user = req.user; // User already populated by authenticateToken
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        console.log(`Starting to generate PDF for user: ${user.userId}`);
        console.log(`User: ${user.userId} (${user.role})`);

        const start = new Date(startDate).toISOString();
        const end = new Date(endDate).toISOString();

        console.log(`Fetching attendance records between ${start} and ${end} for user ${user.userId}`);

        const attendanceRecords = await Attendance.find({
            user: user.userId,
            date: { $gte: new Date(start), $lte: new Date(end) },
        }).lean();

        if (attendanceRecords.length === 0) {
            console.warn(`No attendance records found for user ${user.userId} between ${start} and ${end}`);
            return res.status(404).json({ message: 'No attendance records found' });
        }

        console.log(`Found ${attendanceRecords.length} attendance records for user ${user.userId}`);

        const attendanceData = attendanceRecords.map((record, index) => ({
            serialNo: index + 1,
            date: moment(record.date).format('YYYY-MM-DD'),
            punchIn: record.punchIn || 'N/A',
            punchOut: record.punchOut || 'N/A',
            totalWorkingHours: record.totalWorkingHours || 'N/A',
        }));

        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            user: {
                name: user.name, // Populate name and other fields from `req.user` if needed
                email: user.email,
                phone: user.phone,
                position: user.position,
            },
            attendanceRecords: attendanceData,
        };

        console.log('Attendance data prepared for template rendering.');

        const templatePath = path.join(__dirname, '..', 'templates', 'AttendanceHistoryTemplate.html');
        if (!fs.existsSync(templatePath)) {
            console.error(`Template not found at path: ${templatePath}`);
            return res.status(500).json({ message: 'Template file missing' });
        }

        console.log('Template file found. Compiling...');
        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        const template = handlebars.compile(templateSource);
        const htmlContent = template(reportData);

        console.log('Launching Puppeteer to generate PDF...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        console.log('PDF generated successfully.');
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_history_${moment().format('YYYYMMDDHHmmss')}.pdf`);
        res.end(pdfBuffer);
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ message: 'Failed to generate PDF' });
    }
};

exports.generateCurrentUserAttendanceHistoryExcel = async (req, res) => {
    try {
        const user = req.user; // User extracted from the token
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        console.log(`Generating Excel for Current user: ${user.userId}`);

        // Fetch attendance records for the current user
        const attendanceRecords = await this.getAttendanceByDateRange(user.userId, startDate, endDate);

        if (!attendanceRecords || attendanceRecords.length === 0) {
            return res.status(404).json({ message: 'No attendance records found' });
        }

        // Fetch regularization data for the current user
        const regularizations = await AttendanceRegularization.find({
            user: user.userId,
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

        // Prepare the user data and attendance records for Excel
        const userData = {
            name: user.name,
            email: user.email,
            phone: user.phone,
            dateOfBirth: user.dateOfBirth,
            employeeId: user.employeeId,
            position: user.position,
            managerName: user.managerName,
            managerRole: user.managerRole,
            workLocation: user.workLocation,
            fatherName: user.fatherName,
            plazaName: user.plazaName,
            attendanceRecords: attendanceRecords.map((record, index) => ({
                serialNo: index + 1,
                date: record.date,
                punchIn: record.punchIn || 'N/A',
                punchOut: record.punchOut || 'N/A',
                totalWorkingHours: record.totalWorkingHours || 'N/A',
                image: record.image || null, // Add image here if available
                isRegularized: regularizedDates.has(moment(record.date).format('YYYY-MM-DD')) ? 'Yes' : 'No',
            }))
        };

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance History');

        // Add User Info Section
        const userInfoTitleRow = worksheet.addRow(['User Info']);
        worksheet.mergeCells(`A${userInfoTitleRow.number}:M${userInfoTitleRow.number}`);
        userInfoTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
        userInfoTitleRow.alignment = { horizontal: 'center' };
        userInfoTitleRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '25325F' },
        };

        // Add User Info Headers
        const userHeaders = [
            'Serial No', 'Name', 'Email', 'Phone', 'Date of Birth', 'Employee ID', 
            'Position', 'Manager Name', 'Manager Role', 'Work Location', 'Father Name', 'Plaza Name'
        ];
        const userHeaderRow = worksheet.addRow(userHeaders);
        userHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        userHeaderRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F7A832' },
        };
        userHeaderRow.eachCell(cell => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Add User Info Data (make sure the user data is included here)
        const userInfoRow = worksheet.addRow([
            1, // Serial No. for the current user (always 1 for single user)
            userData.name,
            userData.email,
            userData.phone,
            userData.dateOfBirth,
            userData.employeeId,
            userData.position,
            userData.managerName,
            userData.managerRole,
            userData.workLocation,
            userData.fatherName,
            userData.plazaName
        ]);
        userInfoRow.eachCell(cell => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        worksheet.addRow([]); // Blank row for separation

        // Add Attendance Records Section
        const attendanceTitleRow = worksheet.addRow(['Attendance Records']);
        worksheet.mergeCells(`A${attendanceTitleRow.number}:E${attendanceTitleRow.number}`);
        attendanceTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
        attendanceTitleRow.alignment = { horizontal: 'center' };
        attendanceTitleRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '25325F' },
        };

        // Add Attendance Records Headers
        const attendanceHeaders = ['Date', 'Punch In', 'Punch Out', 'Total Working Hours', 'Regularized'];
        const attendanceHeaderRow = worksheet.addRow(attendanceHeaders);
        attendanceHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        attendanceHeaderRow.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'F7A832' },
        };
        attendanceHeaderRow.eachCell(cell => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        // Add Attendance Records Data
        userData.attendanceRecords.forEach(record => {
            const recordRow = worksheet.addRow([
                record.date,
                record.punchIn,
                record.punchOut,
                record.totalWorkingHours,
                record.isRegularized
            ]);

            if (record.image) {
                // Decode base64 image (assuming the image is a base64 string)
                const imageBuffer = Buffer.from(record.image.split(',')[1], 'base64');

                // Add the image to the workbook
                const imageId = workbook.addImage({
                    buffer: imageBuffer,
                    extension: 'jpeg',
                });

                // Set row height and column width for images
                worksheet.getRow(recordRow.number).height = 60; // Adjust as needed
                worksheet.getColumn(2).width = 15; // Adjust as needed

                // Add the image to fit within the cell
                worksheet.addImage(imageId, {
                    tl: { col: 1, row: recordRow.number - 1 }, // Adjust for zero-based index
                    br: { col: 2, row: recordRow.number }, // End column and row to fit the cell
                    editAs: 'oneCell',
                });
            }
        });

        // Write the Excel file directly to the response
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_history_${moment().format('YYYYMMDDHHmmss')}.xlsx`);
        await workbook.xlsx.write(res);
        res.end(); // Ensure the response is properly closed
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ message: 'Failed to generate Excel report' });
    }
};

exports.generateUserAttendanceHistoryExcel = async (req, res, userId) => {
    try {
        const currentUser = req.user;
        const { startDate, endDate } = req.query;

        console.log(`Generating Excel report requested by user: ${currentUser.userId} (role: ${currentUser.role})`);
        console.log(`Requested date range: Start Date - ${startDate}, End Date - ${endDate}`);
        console.log(`Target user ID for report: ${userId}`);

        if (![1, 2, 3].includes(currentUser.role) || (currentUser.role === 3 && !currentUser.manager)) {
            console.warn('Permission denied: User does not have required permissions to generate report.');
            return res.status(403).json({ message: 'You do not have the required permissions to generate this report' });
        }

        if (!startDate || !endDate) {
            console.warn('Invalid request: Start date and end date are required.');
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        console.log('Fetching attendance records for date range...');
        const attendanceRecords = await this.getAttendanceByDateRange(userId, startDate, endDate);

        if (!attendanceRecords || attendanceRecords.length === 0) {
            console.warn('No attendance records found for the specified date range.');
            return res.status(404).json({ message: 'No attendance records found' });
        }

        console.log(`Attendance records fetched: ${attendanceRecords.length} entries found.`);
        console.log('Fetching approved regularizations...');

        const regularizations = await AttendanceRegularization.find({
            user: userId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
            status: 'Approved',
        }).lean();

        if (!regularizations || regularizations.length === 0) {
            console.log('No regularizations found for this user in the specified date range.');
        } else {
            console.log(`Regularizations fetched: ${regularizations.length} entries found.`);
        }

        const regularizedDates = new Set();
        regularizations.forEach(reg => {
            const key = `${reg.user}-${reg.startDate}-${reg.endDate}`;
            if (!regularizedDates.has(key)) {
                console.log(`Processing regularization from ${reg.startDate} to ${reg.endDate}`);
                const current = moment(reg.startDate);
                const end = moment(reg.endDate);
                while (current.isSameOrBefore(end)) {
                    const formattedDate = current.format('YYYY-MM-DD');
                    regularizedDates.add(formattedDate);
                    console.log(`Regularized date added: ${formattedDate}`);
                    current.add(1, 'days');
                }
            }
        });

        console.log('Generating Excel file...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('User Attendance History');

        const titleRow = worksheet.addRow(['User Attendance History']);
        worksheet.mergeCells(`A${titleRow.number}:F${titleRow.number}`);
        titleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
        titleRow.alignment = { horizontal: 'center' };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '25325F' } };

        const headers = ['Serial No.', 'Date', 'Image', 'Punch In', 'Punch Out', 'Total Working Hours', 'Regularized'];
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F7A832' } };
        headerRow.eachCell(cell => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        attendanceRecords.forEach((record, index) => {
            const row = [
                index + 1,
                moment(record.date).format('YYYY-MM-DD'),
                '', // Empty column for image
                record.punchIn ? moment(record.punchIn).format('HH:mm:ss') : 'N/A',
                record.punchOut ? moment(record.punchOut).format('HH:mm:ss') : 'N/A',
                record.totalWorkingHours || 'N/A',
                regularizedDates.has(moment(record.date).format('YYYY-MM-DD')) ? 'Yes' : 'No',
            ];
        
            // Add the row without the image column
            worksheet.addRow(row);
            console.log(`Added row: ${JSON.stringify(row)}`);
        
            const currentRowIndex = index + 2; // Adjust row index to match the added row (since index starts at 0)
        
            if (record.image) {
                // Decode base64 image (assuming the image is a base64 string)
                const imageBuffer = Buffer.from(record.image.split(',')[1], 'base64');
        
                // Add the image to the workbook
                const imageId = workbook.addImage({
                    buffer: imageBuffer,
                    extension: 'jpeg',
                });
        
                // Set row height and column width for images
                worksheet.getRow(currentRowIndex).height = 60; // Adjust row height to fit the image
                worksheet.getColumn(3).width = 15; // Adjust the column width to fit the image
        
                // Add the image to the correct row and column (no need for -1)
                worksheet.addImage(imageId, {
                    tl: { col: 2, row: currentRowIndex }, // Place the image in the right column and row
                    br: { col: 3, row: currentRowIndex + 1 }, // Make sure it fits properly
                    editAs: 'oneCell',
                });
            }
        });             

        worksheet.columns.forEach(column => {
            column.width = 20;  // Adjust as needed to fit contents
        });

        console.log('Excel file generation complete. Sending response...');
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=user_attendance_${moment().format('YYYYMMDDHHmmss')}.xlsx`);
        await workbook.xlsx.write(res);
        res.end();
        console.log('Excel file successfully written.');
    } catch (error) {
        console.error('Error generating Excel:', error);
        res.status(500).json({ message: 'Failed to generate Excel' });
    }
};

exports.generateUserAttendanceHistoryPDF = async (req, res, userId) => {
    try {
        const { startDate, endDate } = req.query;

        const start = new Date(startDate).toISOString();
        const end = new Date(endDate).toISOString();

        const attendanceRecords = await Attendance.find({
            user: userId,
            date: { $gte: new Date(start), $lte: new Date(end) },
        }).lean();

        if (attendanceRecords.length === 0) {
            return res.status(404).json({ message: 'No attendance records found' });
        }

        const attendanceData = attendanceRecords.map((record, index) => ({
            serialNo: index + 1,
            date: moment(record.date).format('YYYY-MM-DD'),
            punchIn: record.punchIn || 'N/A',
            punchOut: record.punchOut || 'N/A',
            totalWorkingHours: record.totalWorkingHours || 'N/A',
        }));

        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            attendanceRecords: attendanceData,
        };

        const templatePath = path.join(__dirname, '..', 'templates', 'AttendanceHistoryTemplate.html');
        if (!fs.existsSync(templatePath)) {
            return res.status(500).json({ message: 'Template file missing' });
        }

        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        const template = handlebars.compile(templateSource);
        const htmlContent = template(reportData);

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=attendance_history_${moment().format('YYYYMMDDHHmmss')}.pdf`);
        res.end(pdfBuffer);
    } catch (error) {
        console.error('Error generating PDF:', error);
        res.status(500).json({ message: 'Failed to generate PDF' });
    }
};