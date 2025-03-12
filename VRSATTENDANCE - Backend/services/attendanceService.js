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
const authenticateToken = require('../middleware/authenticateToken');
const userService = require('../services/userService');
const { sendEmailWithAttachment } = require('../services/emailService');
const { sendxlsxEmailWithAttachment} = require('../services/xlsxemailService');
const leaveService = require('../services/leaveService');
const { error } = require('console');
const streamBuffers = require('stream-buffers');


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
    let plazaName = null;
    const userLat = parseFloat(data.latitude);
    const userLon = parseFloat(data.longitude);

    for (const plaza of tollPlazas) {
        const plazaLat = parseFloat(plaza.Latitude);
        const plazaLon = parseFloat(plaza.Longitude);

        const distance = getDistanceFromLatLonInKm(userLat, userLon, plazaLat, plazaLon);
        console.log(`Distance to ${plaza.LocationName}: ${distance} km`);

        if (distance <= 1) {
            withinRange = true;
            plazaName = plaza.LocationName;
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
                plazaName,
                ...data
            });
            console.log('Created new attendance record:', attendance);
        } else {
            attendance.punchIn = new Date();
            attendance.plazaName = plazaName;
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
        let managerName;
        if (data.managerId) {
            // Fetch manager details using managerId
            const manager = await User.findOne({ _id: data.managerId });
            managerName = manager ? manager.name : 'No manager assigned';
        } else {
            // Fetch user and their assigned manager
            const user = await User.findById(userId).populate('managerId'); // Assuming managerId is a reference
            managerName = user?.managerId?.name || user?.managerName || 'No manager assigned';
        }
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
                approverName: managerName,
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

    return { message: `Shift ${status} marked successfully at ${plazaName}.` };
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

                console.log(`Raw PunchIn:`, record.punchIn);
                console.log(`Raw PunchOut:`, record.punchOut);

                return {
                    date: record.date,
                    punchIn: record.punchIn ? new Date(record.punchIn).toISOString() : null,
                    punchOut: record.punchOut ? new Date(record.punchOut).toISOString() : null,
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

exports.generateAttendanceReportPDF = async (startDate, endDate, req, res, deliveryMethod, recipientEmail) => {
    try {
        console.log(`🔹 Start Date: ${startDate}, End Date: ${endDate}`);
        console.log(`🔹 Delivery Method: ${deliveryMethod}`);
        console.log(`🔹 Recipient Email: ${recipientEmail || 'N/A'}`);

        const normalizedDeliveryMethod = (deliveryMethod || '').toLowerCase();
        if (!['download', 'email'].includes(normalizedDeliveryMethod)) {
            console.error(`❌ Invalid delivery method: ${normalizedDeliveryMethod}`);
            return res.status(400).json({ message: 'Invalid delivery method.' });
        }
        console.log('📌 Fetching users...');
        const users = await User.find({});
        console.log(`✅ Total users found: ${users.length}`);

        if (users.length === 0) {
            console.warn('⚠️ No users found.');
            return res.status(404).json({ message: 'No users found' });
        }

        const templatePath = path.join(__dirname, '..', 'templates', 'AttendanceReportUI.html');
        console.log(`📄 Template Path: ${templatePath}`);
        let templateSource;
        try {
            templateSource = fs.readFileSync(templatePath, 'utf-8');
            console.log('✅ Template loaded successfully.');
        } catch (templateError) {
            console.error('❌ Error reading template file:', err);
            throw new Error('Template file not found or inaccessible.');
        }
        const template = handlebars.compile(templateSource);
        console.log('✅ Template compiled.');

        console.log('🛠 Processing users data for the report...');
        const usersData = await Promise.all(users.map(async (user) => {
            console.log(`👤 Processing User: ${user.name} (ID: ${user._id})`);
            const attendanceRecords = await this.getAttendanceByDateRange(user._id.toString(), startDate, endDate).catch(err => {
                console.error(`❌ Error fetching attendance for ${user.name}:`, err);
                return [];
            });            
            console.log(`✅ Total attendance records for ${user.name}: ${attendanceRecords.length}`);

             // Fetch regularizations
             const regularizations = await AttendanceRegularization.find({
                user: user._id,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate },
                status: 'Approved',
            })
            .select('user startDate endDate status approvedBy')
            .lean();

            const regularizedDates = new Map();
            regularizations.forEach(reg => {
                const current = moment(reg.startDate);
                const end = moment(reg.endDate);
                while (current.isSameOrBefore(end)) {
                    regularizedDates.set(current.format('DD-MM-YYYY'), reg.approvedBy);
                    current.add(1, 'days');
                }
            });

            const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
            let totalPresent = 0;
            let totalLeaves = 0;
            let totalPaidDays = 0;
            // Process attendance records
            const processedAttendanceRecords = attendanceRecords.map((record, index) => {
                const punchIn = record.punchIn ? moment(record.punchIn) : null;
                const punchOut = record.punchOut ? moment(record.punchOut) : null;

                let status = 'Absent'; // Default status
                let totalWorkingHours = record.totalWorkingHours || 'N/A';

                if (totalWorkingHours === 'Shift not marked end' || totalWorkingHours === 'Attendance Regularized') {
                    status  = 'Present';
                    totalWorkingHours = 'Shift not marked end'; // Keep it as is
                } else if (punchIn && punchOut) {
                    const duration = moment.duration(punchOut.diff(punchIn));
                    const hours = duration.hours(); // Get total hours
                    const minutes = duration.minutes(); // Get remaining minutes
                    totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`;

                    if (punchIn && punchOut) {
                        const duration = moment.duration(punchOut.diff(punchIn));
                        const hours = duration.hours();
                        const minutes = duration.minutes();
                        
                        totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`;
                
                        if (hours >= 8) {
                            status = 'Present';
                        } else if (hours > 0) {
                            status = 'Half Day Present';
                        }
                    }
                }
                const dateKey = moment(record.date).format('DD-MM-YYYY');

                if (status === 'Present') {
                    totalPresent += 1;
                } else if (status === 'Half Day Present') {
                    totalPresent += 0.5;
                }
                return {
                    serialNo: index + 1,
                    date: moment(record.date).format('DD-MM-YYYY'),
                    image: record.image,
                    punchIn: punchIn ? punchIn.format('hh:mm A') : 'N/A',
                    punchOut: punchOut ? punchOut.format('hh:mm A') : 'N/A',
                    totalWorkingHours: totalWorkingHours,
                    status: status, // Attendance status
                    attendanceRegularized: regularizedDates.has(dateKey) ? 'Yes' : 'No',
                    approvedBy: regularizedDates.get(dateKey) || 'N/A',
                };
            });

            let leaveRequests = [];
            try {
                leaveRequests = await leaveService.getLeaveRequests(user._id, user.role);
                totalLeaves = leaveRequests.length;
                totalPaidDays = totalPresent + totalLeaves;
                console.log(`✅ Processed leave data for ${user.name}: ${totalLeaves} leaves.`);
            } catch (err) {
                console.error(`❌ Error fetching leave requests for ${user.name}:`, err);
            }

            return {
                name: user.name,
                email: user.email,
                phone: user.phone,
                dateOfBirth: user.dateOfBirth ? moment(user.dateOfBirth).format('DD-MM-YYYY') : 'Not provided',
                employeeId: user.employeeId,
                position: user.position,
                managerName: user.managerName,
                managerRole: user.managerRole,
                workLocation: user.workLocation,
                fatherName: user.fatherName,
                plazaName: user.plazaName,
                attendanceRecords: processedAttendanceRecords, // Use the processed records
                summary: { totalDays, totalPresent, totalLeaves, totalPaidDays },
            };
        }));

        console.log('✅ User data processing complete.');
        console.log('📌 Generating HTML content...');        
        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            users: usersData,
        };
        console.log('📌 Report Data:', JSON.stringify(reportData, null, 2));
        const htmlContent = template(reportData);
        console.log('✅ HTML content generated.');
        console.log('🚀 Launching Puppeteer...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        console.log('📄 Generating PDF...');
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        console.log('Sending PDF response...');
        if (deliveryMethod === 'download') {
            console.log('Delivery Method: Download');
            console.log('📥 Sending PDF response for download...');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename=attendance_report_${moment().format('YYYYMMDDHHmmss')}.pdf`
            );
            return res.end(pdfBuffer);
        } else if (deliveryMethod === 'email') {
            console.log('Delivery Method: Email');
            console.log('📧 Sending email with PDF attachment...');
            if (!recipientEmail) {
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }

            const subject = 'Attendance Report';
            const name = req.user?.name || 'User';
            const message = 'Please find your attendance report attached to this email.';

            await sendEmailWithAttachment(recipientEmail, { buffer: pdfBuffer }, { subject, name, message, fileType: 'pdf' });
            console.log('✅ Email sent successfully.');
            return res.status(200).json({ message: 'Attendance report emailed successfully.' });
        } else {
            console.error('❌ Error sending email:', error);
            return res.status(400).json({ message: 'Invalid delivery method.' });
        }
    } catch (error) {
        console.error('❌ Error during PDF generation:', error);
        res.status(500).json({ message: 'Failed to generate the report.' });
    }
};

exports.generateAttendanceReportExcel = async (startDate, endDate, res, deliveryMethod, recipientEmail) => {
    try {
        const users = await User.find({});

        if (users.length === 0) {
            return res.status(404).json({ message: 'No users found' });
        }

        const usersData = await Promise.all(users.map(async (user, userIndex) => {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id.toString(), startDate, endDate);
            const regularizations = await AttendanceRegularization.find({
                user: user._id,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate },
                status: 'Approved'
            })
            .select('user startDate endDate status approvedBy')
            .lean();

            // Map regularization dates for quick lookup
            const regularizedDates = new Map();
            regularizations.forEach(reg => {
                const current = moment(reg.startDate);
                const end = moment(reg.endDate);
                while (current.isSameOrBefore(end)) {
                    regularizedDates.set(current.format('DD-MM-YYYY'), reg.approvedBy);
                    current.add(1, 'days');
                }
            });

            const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
            let totalPresent = 0;
            let totalLeaves = 0;
            let totalPaidDays = 0;

            try {
                const leaveRequests = await leaveService.getLeaveRequests(user._id, user.role);
                totalLeaves = leaveRequests.length;
                console.log(`\u2705 Processed leave data for ${user.name}: ${totalLeaves} leaves.`);
            } catch (err) {
                console.error(`\u274c Error fetching leave requests for ${user.name}:`, err);
            }

            totalPaidDays = totalPresent + totalLeaves;

            return {
                name: user.name,
                email: user.email,
                phone: user.phone,
                dateOfBirth: user.dateOfBirth ? moment(user.dateOfBirth).format('DD-MM-YYYY') : 'Not provided',
                employeeId: user.employeeId,
                position: user.position,
                managerName: user.managerName,
                managerRole: user.managerRole,
                workLocation: user.workLocation,
                fatherName: user.fatherName,
                plazaName: user.plazaName,
                attendanceRecords: attendanceRecords.map((record, index) => {
                    const punchIn = record.punchIn ? moment(record.punchIn) : null;
                    const punchOut = record.punchOut ? moment(record.punchOut) : null;
                    let status = 'Absent';
                    let totalWorkingHours = record.totalWorkingHours || 'N/A';

                    if (totalWorkingHours === 'Shift not marked end' || totalWorkingHours === 'Attendance Regularized') {
                        status = 'Present';
                        totalWorkingHours = 'Shift not marked end';
                    } else if (punchIn && punchOut) {
                        const duration = moment.duration(punchOut.diff(punchIn));
                        const hours = Math.floor(duration.asHours());
                        const minutes = duration.minutes();
                        totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`;

                        if (hours >= 8) {
                            status = 'Present';
                        } else if (hours > 0) {
                            status = 'Half Day Present';
                        }
                    }

                    if (status === 'Present') totalPresent += 1;
                    if (status === 'Half Day Present') totalPresent += 0.5;

                    const dateKey = moment(record.date).format('DD-MM-YYYY');
                    return {
                    serialNo: index + 1,
                    date: moment(record.date).format('DD-MM-YYYY'),
                    punchIn: punchIn ? punchIn.format('hh:mm A') : 'N/A',
                    punchOut: punchOut ? punchOut.format('hh:mm A') : 'N/A',
                    totalWorkingHours: record.totalWorkingHours || 'N/A',
                    status,
                    image: record.image || null,
                    isRegularized: regularizedDates.has(dateKey) ? 'Yes' : 'No',
                    approvedBy: regularizedDates.get(dateKey) || 'N/A',
                };
            }),
            summary: { totalDays, totalPresent, totalLeaves, totalPaidDays },
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
            const attendanceHeaders = ['Date', 'Image', 'Status', 'Punch In', 'Punch Out', 'Total Working Hours', 'Regularized', 'Approved By'];
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
                    record.status,
                    record.punchIn,
                    record.punchOut,
                    record.totalWorkingHours,
                    record.isRegularized,
                    record.approvedBy,
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

    // Add Summary Table for all users at the end
    const summaryTitleRow = worksheet.addRow(['Overall Attendance Summary']);
    worksheet.mergeCells(`A${summaryTitleRow.number}:B${summaryTitleRow.number}`);
    summaryTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
    summaryTitleRow.alignment = { horizontal: 'center' };
    summaryTitleRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '25325F' },
    };
    
    usersData.forEach((user, userIndex) => {
        const userInfoRows = [
            ['Name', user.name],
            ['Email', user.email],
            ['Phone', user.phone],
            ['Total Days', user.summary.totalDays],
            ['Total Present', user.summary.totalPresent],
            ['Total Leaves', user.summary.totalLeaves],
            ['Total Paid Days', user.summary.totalPaidDays]
        ];

        userInfoRows.forEach((row) => {
            const newRow = worksheet.addRow(row);
            newRow.font = { bold: true };
            newRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'DDEBF7' },
            };
        });

        worksheet.addRow([]); // Blank row for separation
    });

        const buffer = await workbook.xlsx.writeBuffer();

        if (deliveryMethod === "email") {
            if (!recipientEmail) {
              return res.status(400).json({ message: "Email is required for deliveryMethod=email" });
            }
          
            try {
              const subject = "Attendance Report";
              const name = "Employee";
              const message = `Please find attached your attendance report for the period from ${startDate} to ${endDate}.`;
              const fileType = "xlsx";
          
              await sendxlsxEmailWithAttachment(recipientEmail, { buffer }, { subject, name, message, fileType });
          
              return res.status(200).json({ message: "Attendance report emailed successfully" });
            } catch (error) {
              console.error("Error sending email:", error);
              return res.status(500).json({ message: "Failed to send email" });
            }
          }
          

        if (deliveryMethod === 'download') {
            const fileName = `attendance_report_${moment().format('YYYYMMDDHHmmss')}.xlsx`;

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
            res.send(buffer);
            res.end();
        }
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ message: 'Failed to generate Excel report' });
    }
};

exports.generateCurrentUserAttendanceHistoryPDF = async (req, res, userId) => {
    try {
        console.log('Starting PDF generation process...');
        
        // Validate and log the user object
        userId = userId || req.user?.userId; // No re-declaration
        console.log('Resolved userId:', userId);
        
        if (!userId) {
            console.error('User ID is missing.');
            return res.status(400).json({ message: 'Invalid user data: userId is required.' });
        }

        // Fetch complete user details from the database
        const userDetails = await User.findById(userId).select(
            'name email phone position dateOfBirth fatherName employeeId managerName managerRole workLocation plazaName'
        );        
        if (!userDetails) {
            console.error('User details not found for userId:', userId);
            return res.status(404).json({ message: 'User not found' });
        }

        // Extract query parameters
        const { startDate, endDate, deliveryMethod, recipientEmail } = req.query;
        if (!startDate || !endDate) {
            console.error('Start date or end date is missing.');
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const finalRecipientEmail = deliveryMethod === 'email' ? req.user?.email : recipientEmail;

        if (deliveryMethod === 'email' && !finalRecipientEmail) {
            console.error('Email is required for delivery method "email".');
            return res.status(400).json({ message: 'Email is required when delivery method is "email"' });
        }

        console.log(`Fetching attendance records for user ${userId} between ${startDate} and ${endDate}...`);

        // Fetch attendance records
        const attendanceRecords = await this.getAttendanceByDateRange(userId.toString(), startDate, endDate).catch(
            (err) => {
                console.error('Error fetching attendance records:', err);
                throw new Error('Failed to fetch attendance records');
            }
        );

        if (!attendanceRecords || attendanceRecords.length === 0) {
            console.warn(`No attendance records found for user ${userId}`);
            return res.status(404).json({ message: 'No attendance records found' });
        }

        console.log('Fetched attendance records:', attendanceRecords);

        const regularizations = await AttendanceRegularization.find({
            user: userId,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
            status: 'Approved',
        })
        .select('user startDate endDate status approvedBy')
        .lean();

        const regularizedDates = new Map();
        regularizations.forEach(reg => {
        const current = moment(reg.startDate);
        const end = moment(reg.endDate);
        while (current.isSameOrBefore(end)) {
        regularizedDates.set(current.format('DD-MM-YYYY'), reg.approvedBy || 'N/A'); // Store approvedBy
        current.add(1, 'days');
    }
});
        const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
        let totalPresent = 0;
        let totalLeaves = 0;
        let totalPaidDays = 0;

        // Prepare attendance data
        const attendanceData = attendanceRecords.map((record, index) => {
            // Parse punchIn and punchOut times using moment
            const punchInTime = record.punchIn ? moment(record.punchIn) : null;
            const punchOutTime = record.punchOut ? moment(record.punchOut) : null;
        
            // Default total working hours and status
            let attendanceStatus = 'Absent';
            let totalWorkingHours = record.totalWorkingHours || 'N/A';
        
            // Check if "Shift not marked end" condition is met
            if (totalWorkingHours === 'Shift not marked end' || totalWorkingHours === 'Attendance Regularized') {
                attendanceStatus = 'Present';
                totalWorkingHours = 'Shift not marked end'; 
            } else if (punchInTime && punchOutTime) {
                // Calculate total working hours if both punchIn and punchOut exist
                const duration = moment.duration(punchOutTime.diff(punchInTime));
                const hours = duration.hours(); // Get hours part
                const minutes = duration.minutes(); // Get minutes part
                totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`; // Format hours and minutes
        
                // Determine attendance status based on working hours
                if (hours >= 8) {
                    attendanceStatus = 'Present'; // 8 or more hours: Present
                } else if (hours > 0 && hours < 8) {
                    attendanceStatus = 'Half Day Present'; // Less than 8 hours: Half Day Present
                }
            }

            if (attendanceStatus === 'Present') {
                totalPresent += 1;
            } else if (attendanceStatus === 'Half Day Present') {
                totalPresent += 0.5;
            }
            const dateKey = moment(record.date).format('DD-MM-YYYY');
            // Return the formatted record
            return {
                serialNo: index + 1,
                image: record.image || 'N/A', // Default to 'N/A' if image is not available
                date: moment(record.date).format('DD-MM-YYYY'),
                punchIn: punchInTime ? punchInTime.format('hh:mm A') : 'N/A',
                punchOut: punchOutTime ? punchOutTime.format('hh:mm A') : 'N/A',
                totalWorkingHours: totalWorkingHours, // Use formatted total working hours
                status: attendanceStatus, // Attendance status based on criteria
                attendanceRegularized: regularizedDates.has(dateKey) ? 'Yes' : 'No',
                approvedBy: regularizedDates.get(dateKey) || 'N/A',
            };
        });

        try {
            leaveRequests = await leaveService.getLeaveRequests(userId, req.user?.role);
            totalLeaves = leaveRequests.length;
        } catch (err) {
            console.error(`Error fetching leave requests for user ${userId}:`, err);
        }

        // Calculate total paid days
        totalPaidDays = totalPresent + totalLeaves;

        // Prepare report data with the complete user details
        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            users: [{
                name: userDetails.name || 'Not provided',
                email: userDetails.email || 'Not provided',
                phone: userDetails.phone || 'Not provided',
                dateOfBirth: userDetails.dateOfBirth ? moment(userDetails.dateOfBirth).format('DD-MM-YYYY') : 'Not provided',
                fatherName: userDetails.fatherName || 'Not provided',
                position: userDetails.position || 'Not provided',
                employeeId: userDetails.employeeId || 'Not provided',
                managerName: userDetails.managerName || 'Not provided',
                managerRole: userDetails.managerRole || 'Not provided',
                workLocation: userDetails.workLocation || 'Not provided',
                plazaName: userDetails.plazaName || 'Not provided',
                attendanceRecords: attendanceData,
                summary: {
                    totalDays,
                    totalPresent,
                    totalLeaves,
                    totalPaidDays,
                },
            }],
        };
        console.log('Report data prepared:', reportData);

        // Check if template exists
        const templatePath = path.join(__dirname, '..', 'templates', 'AttendanceReportUI.html');
        console.log('Checking template file at path:', templatePath);
        if (!fs.existsSync(templatePath)) {
            console.error(`Template file not found at path: ${templatePath}`);
            return res.status(500).json({ message: 'Template file missing' });
        }

        // Compile template
        console.log('Template file found. Compiling...');
        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        const template = handlebars.compile(templateSource);
        const htmlContent = template(reportData);

        console.log('Generated HTML content:', htmlContent);

        console.log('Launching Puppeteer to generate PDF...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        console.log('PDF generated successfully.');
        await browser.close();

        // Send PDF response
        console.log('Sending PDF response to client...');
        if (deliveryMethod === 'download') {
            console.log('Delivery Method: Download');
            console.log('Sending PDF response for download...');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename=attendance_report_${moment().format('YYYYMMDDHHmmss')}.pdf`
            );
            return res.end(pdfBuffer);
        } else if (deliveryMethod === 'email') {
            console.log('Delivery Method: Email');
            if (!finalRecipientEmail) {
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }

            const subject = 'Attendance Report';
            const name = req.user?.name || 'User';
            const message = 'Please find your attendance report attached to this email.';

            await sendEmailWithAttachment(finalRecipientEmail, { buffer: pdfBuffer }, { subject, name, message, fileType: 'pdf' });

            return res.status(200).json({ message: 'Attendance report emailed successfully.' });
        } else {
            return res.status(400).json({ message: 'Invalid delivery method.' });
        }
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({ message: 'Failed to generate the report.' });
    }
};

exports.generateCurrentUserAttendanceHistoryExcel = async (req, res, { deliveryMethod, recipientEmail }) => {
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
        })
        .select('user startDate endDate status approvedBy')
        .lean();

        // Map regularization dates for quick lookup
        const regularizedDates = new Map();
        regularizations.forEach(reg => {
            const current = moment(reg.startDate);
            const end = moment(reg.endDate);
            while (current.isSameOrBefore(end)) {
                regularizedDates.set(current.format('DD-MM-YYYY'), reg.approvedBy);
                current.add(1, 'days');
            }
        });

        const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
            let totalPresent = 0;
            let totalLeaves = 0;
            let totalPaidDays = 0;

            try {
                const leaveRequests = await leaveService.getLeaveRequests(user._id, user.role);
                totalLeaves = leaveRequests.length;
                console.log(`\u2705 Processed leave data for ${user.name}: ${totalLeaves} leaves.`);
            } catch (err) {
                console.error(`\u274c Error fetching leave requests for ${user.name}:`, err);
            }

            totalPaidDays = totalPresent + totalLeaves;

        // Prepare the user data and attendance records for Excel
        const userData = {
            // name: user.name || 'Not provided',
            // email: user.email || 'Not provided',
            // phone: user.phone || 'Not provided',
            // dateOfBirth: user.dateOfBirth ? moment(user.dateOfBirth).format('DD-MM-YYYY') : 'Not provided',
            // employeeId: user.employeeId || 'Not provided',
            // position: user.position || 'Not provided',
            // managerName: user.managerName || 'Not provided',
            // managerRole: user.managerRole || 'Not provided',
            // workLocation: user.workLocation || 'Not provided',
            // fatherName: user.fatherName || 'Not provided',
            // plazaName: user.plazaName || 'Not provided',
            attendanceRecords: attendanceRecords.map((record, index) => {
                const punchIn = record.punchIn ? moment(record.punchIn) : null;
                const punchOut = record.punchOut ? moment(record.punchOut) : null;
                let status = 'Absent';
                let totalWorkingHours = record.totalWorkingHours || 'N/A';

                if (totalWorkingHours === 'Shift not marked end' || totalWorkingHours === 'Attendance Regularized') {
                    status = 'Present';
                    totalWorkingHours = 'Shift not marked end';
                } else if (punchIn && punchOut) {
                    const duration = moment.duration(punchOut.diff(punchIn));
                    const hours = Math.floor(duration.asHours());
                    const minutes = duration.minutes();
                    totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`;

                    if (hours >= 8) {
                        status = 'Present';
                    } else if (hours > 0) {
                        status = 'Half Day Present';
                    }
                }

                if (status === 'Present') totalPresent += 1;
                if (status === 'Half Day Present') totalPresent += 0.5;

                const dateKey = moment(record.date).format('DD-MM-YYYY');
                return {
                serialNo: index + 1,
                date: moment(record.date).format('DD-MM-YYYY'),
                punchIn: record.punchIn ? moment(record.punchIn).format('hh:mm A') : 'N/A',
                punchOut: record.punchOut ? moment(record.punchOut).format('hh:mm A') : 'N/A',
                totalWorkingHours: record.totalWorkingHours || 'N/A',
                status,
                image: record.image || null, // Add image here if available
                isRegularized: regularizedDates.has(dateKey) ? 'Yes' : 'No',
                approvedBy: regularizedDates.get(dateKey) || 'N/A',
            };
        }),
        summary: { totalDays, totalPresent, totalLeaves, totalPaidDays },
    };

        console.log('Prepared user data for Excel:', userData);

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance History');

        // Add User Info Section
        // const userInfoTitleRow = worksheet.addRow(['User Info']);
        // worksheet.mergeCells(`A${userInfoTitleRow.number}:M${userInfoTitleRow.number}`);
        // userInfoTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
        // userInfoTitleRow.alignment = { horizontal: 'center' };
        // userInfoTitleRow.fill = {
            // type: 'pattern',
            // pattern: 'solid',
            // fgColor: { argb: '25325F' },
        // };

        // Add User Info Headers
        const userHeaders = [
            // 'Serial No', 'Name', 'Email', 'Phone', 'Date of Birth', 'Employee ID', 
            // 'Position', 'Manager Name', 'Manager Role', 'Work Location', 'Father Name', 'Plaza Name'
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
            // 1, // Serial No. for the current user (always 1 for single user)
            // userData.name,
            // userData.email,
            // userData.phone,
            // userData.dateOfBirth,
            // userData.employeeId,
            // userData.position,
            // userData.managerName,
            // userData.managerRole,
            // userData.workLocation,
            // userData.fatherName,
            // userData.plazaName
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
        const attendanceHeaders = ['Date', 'Image', 'Status', 'Punch In', 'Punch Out', 'Total Working Hours', 'Regularized', 'Approved By'];
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
                '',
                record.status,
                record.punchIn,
                record.punchOut,
                record.totalWorkingHours,
                record.isRegularized,
                record.approvedBy,
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

        // Add Summary Table for all users at the end
    const summaryTitleRow = worksheet.addRow(['Overall Attendance Summary']);
    worksheet.mergeCells(`A${summaryTitleRow.number}:B${summaryTitleRow.number}`);
    summaryTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
    summaryTitleRow.alignment = { horizontal: 'center' };
    summaryTitleRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '25325F' },
    };
    
    // userData.forEach((user, userIndex) => {
        const userInfoRows = [
            ['Name', user.name || 'N/A'],
            ['Email', user.email || 'N/A'],
            ['Phone', user.phone || 'N/A'],
            ['Total Days', userData.summary?.totalDays || 0],
            ['Total Present', userData.summary?.totalPresent || 0],
            ['Total Leaves', userData.summary?.totalLeaves || 0],
            ['Total Paid Days', userData.summary?.totalPaidDays || 0]
        ];
        console.log('userData:', JSON.stringify(userData, null, 2));

        userInfoRows.forEach((row) => {
            const newRow = worksheet.addRow(row);
            newRow.font = { bold: true };
            newRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'DDEBF7' },
            };
        });

        worksheet.addRow([]); // Blank row for separation
    // });

        const buffer = await workbook.xlsx.writeBuffer();

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_history_${moment().format('YYYYMMDDHHmmss')}.xlsx`);
            res.end(buffer);
        } else if (deliveryMethod === 'email') {
            const subject = 'Attendance Report';
            const name = user.name || 'Employee';
            const message = `Please find attached your attendance report for the period from ${startDate} to ${endDate}.`;
            const fileType = 'xlsx';

            try {
                await sendxlsxEmailWithAttachment(recipientEmail, { buffer }, { subject, name, message, fileType });
                return res.status(200).json({ message: 'Attendance report emailed successfully' });
            } catch (error) {
                console.error('Error sending email:', error);
                return res.status(500).json({ message: 'Failed to send email' });
            }
        }
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ message: 'Failed to generate Excel report' });
    }
};

exports.generateUserAttendanceHistoryExcel = async (req, res, userId) => {
    try {
        const currentUser = req.user;
        const { startDate, endDate, deliveryMethod, recipientEmail } = req.query;

        console.log(`Generating Excel report requested by user: ${currentUser.userId} (role: ${currentUser.role})`);
        console.log(`Requested date range: Start Date - ${startDate}, End Date - ${endDate}`);
        console.log(`Target user ID for report: ${userId}`);
        console.log(`Delivery method: ${deliveryMethod}, Email: ${recipientEmail}`);

        if (![1, 2, 3].includes(currentUser.role) || (currentUser.role === 3 && !currentUser.manager)) {
            console.warn('Permission denied: User does not have required permissions to generate report.');
            return res.status(403).json({ message: 'You do not have the required permissions to generate this report' });
        }

        if (!startDate || !endDate) {
            console.warn('Invalid request: Start date and end date are required.');
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const finalRecipientEmail = deliveryMethod === 'email' ? req.user?.email : recipientEmail;

        if (deliveryMethod === 'email' && !finalRecipientEmail) {
            console.error('Recipient email is required for email delivery method.');
            return res.status(400).json({ message: 'Email is required when delivery method is "email"' });
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
        })
        .select('user startDate endDate status approvedBy')
        .lean();

        if (!regularizations || regularizations.length === 0) {
            console.log('No regularizations found for this user in the specified date range.');
        } else {
            console.log(`Regularizations fetched: ${regularizations.length} entries found.`);
        }

        const regularizedDates = new Map();
        regularizations.forEach(reg => {
            const key = `${reg.user}-${reg.startDate}-${reg.endDate}`;
            if (!regularizedDates.has(key)) {
                console.log(`Processing regularization from ${reg.startDate} to ${reg.endDate}`);
                const current = moment(reg.startDate);
                const end = moment(reg.endDate);
                while (current.isSameOrBefore(end)) {
                    const formattedDate = current.format('DD-MM-YYYY');
                    regularizedDates.set(formattedDate, reg.approvedBy);
                    console.log(`Regularized date added: ${formattedDate}`);
                    current.add(1, 'days');
                }
            }
        });

        const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
            let totalPresent = 0;
            let totalLeaves = 0;
            let totalPaidDays = 0;

            const user = await User.findById(userId).lean();
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            try {
                const leaveRequests = await leaveService.getLeaveRequests(user._id, user.role);
                totalLeaves = leaveRequests.length;
                console.log(`\u2705 Processed leave data for ${user.name}: ${totalLeaves} leaves.`);
            } catch (err) {
                console.error(`\u274c Error fetching leave requests for ${user.name}:`, err);
            }

            totalPaidDays = totalPresent + totalLeaves;

        console.log('Generating Excel file...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('User Attendance History');

        const titleRow = worksheet.addRow(['User Attendance History']);
        worksheet.mergeCells(`A${titleRow.number}:F${titleRow.number}`);
        titleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
        titleRow.alignment = { horizontal: 'center' };
        titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '25325F' } };

        const headers = ['Serial No.', 'Date', 'Image', 'Status', 'Punch In', 'Punch Out', 'Total Working Hours', 'Regularized', 'Approved By'];
        const headerRow = worksheet.addRow(headers);
        headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
        headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F7A832' } };
        headerRow.eachCell(cell => {
            cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
        });

        attendanceRecords.forEach((record, index) => {
            let status = 'Absent';
            const punchIn = record.punchIn ? moment(record.punchIn) : null;
            const punchOut = record.punchOut ? moment(record.punchOut) : null;
            let totalWorkingHours = record.totalWorkingHours || 'N/A';

            if (totalWorkingHours === 'Shift not marked end' || totalWorkingHours === 'Attendance Regularized') {
                status = 'Present';
            } else if (punchIn && punchOut) {
                const duration = moment.duration(punchOut.diff(punchIn));
                const hours = Math.floor(duration.asHours());
                const minutes = duration.minutes();

                totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`;
                if (hours >= 8) {
                    status = 'Present';
                } else if (hours > 0) {
                    status = 'Half Day Present';
                }
            }

            if (status === 'Present') totalPresent += 1;
            if (status === 'Half Day Present') totalPresent += 0.5;

            const dateKey = moment(record.date).format('DD-MM-YYYY');
            const row = [
                index + 1,
                moment(record.date).format('DD-MM-YYYY'),
                '', // Empty column for image
                status,
                punchIn ? punchIn.format('hh:mm A') : 'N/A',
                punchOut ? punchOut.format('hh:mm A') : 'N/A',
                record.totalWorkingHours || 'N/A',
                regularizedDates.has(dateKey) ? 'Yes' : 'No',
                regularizedDates.get(dateKey) || 'N/A',
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

         // Add Summary Table for all users at the end
    const summaryTitleRow = worksheet.addRow(['Overall Attendance Summary']);
    worksheet.mergeCells(`A${summaryTitleRow.number}:B${summaryTitleRow.number}`);
    summaryTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
    summaryTitleRow.alignment = { horizontal: 'center' };
    summaryTitleRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: '25325F' },
    };

    const userData = {
        summary: { totalDays, totalPresent, totalLeaves, totalPaidDays }
    };
    
    console.log('userData:', JSON.stringify(userData, null, 2)); // Debugging log
    
    // userData.forEach((user, userIndex) => {
        const userInfoRows = [
            ['Name', user?.name || 'N/A'],
            ['Email', user?.email || 'N/A'],
            ['Phone', user?.phone || 'N/A'],
            ['Total Days', userData.summary?.totalDays || 0],
            ['Total Present', userData.summary?.totalPresent || 0],
            ['Total Leaves', userData.summary?.totalLeaves || 0],
            ['Total Paid Days', userData.summary?.totalPaidDays || 0]
        ];
        console.log('userData:', JSON.stringify(userData, null, 2));

        userInfoRows.forEach((row) => {
            const newRow = worksheet.addRow(row);
            newRow.font = { bold: true };
            newRow.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: 'DDEBF7' },
            };
        });

        worksheet.addRow([]); // Blank row for separation
    // });
        console.log('Excel file generation complete. Sending response...');
        const buffer = await workbook.xlsx.writeBuffer();

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_history_${moment().format('YYYYMMDDHHmmss')}.xlsx`);
            res.end(buffer);
        } else if (deliveryMethod === 'email') {
            if (!finalRecipientEmail) {
                return res.status(400).json({ message: 'Email address is required for email delivery method' });
            }
            
            const subject = 'Attendance Report';
            const name = 'Employee';
            const message = `Please find attached your attendance report for the period from ${startDate} to ${endDate}.`;
            const fileType = 'xlsx';

            try {
                await sendxlsxEmailWithAttachment(finalRecipientEmail, { buffer }, { subject, name, message, fileType });
                return res.status(200).json({ message: 'Attendance report emailed successfully' });
            } catch (error) {
                console.error('Error sending email:', error);
                return res.status(500).json({ message: 'Failed to send email' });
            }
        }
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ message: 'Failed to generate Excel report' });
    }
};

exports.generateUserAttendanceHistoryPDF = async (req, res, userId) => {
    try {
        const { startDate, endDate, deliveryMethod, recipientEmail } = req.query;

        // Log the start and end date to check if they are correct
        console.log('Start Date:', startDate);
        console.log('End Date:', endDate);

        // Validate input dates
        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const finalRecipientEmail = deliveryMethod === 'email' ? req.user?.email : recipientEmail;

        if (!deliveryMethod || !['download', 'email'].includes(deliveryMethod)) {
            return res.status(400).json({ message: 'Valid deliveryMethod (download or email) is required' });
        }

        if (deliveryMethod === 'email' && !finalRecipientEmail) {
            return res.status(400).json({ message: 'Email is required when deliveryMethod is "email"' });
        }

        const start = new Date(startDate).toISOString();
        const end = new Date(endDate).toISOString();

        // Log the formatted start and end dates
        console.log('Formatted Start Date:', start);
        console.log('Formatted End Date:', end);

        // Fetch attendance records using getAttendanceByDateRange method
        const attendanceRecords = await this.getAttendanceByDateRange(userId.toString(), startDate, endDate)
            .catch(err => {
                console.error('Error fetching attendance records:', err);
                return res.status(500).json({ message: 'Failed to fetch attendance records' });
            });

        // Log the fetched attendance records to see if data exists
        console.log('Attendance Records:', attendanceRecords);

        if (attendanceRecords.length === 0) {
            return res.status(404).json({ message: 'No attendance records found' });
        }

        // Fetch user details using the provided userId
        const user = await userService.getUserById(userId) // Call the user service function directly
            .catch(err => {
                console.error('Error fetching user details:', err);
                return res.status(500).json({ message: 'Failed to fetch user details' });
            });

        // Log the fetched user data
        console.log('User Details:', user);

        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        const regularizations = await AttendanceRegularization.find({
            user: user._id,
            startDate: { $lte: endDate },
            endDate: { $gte: startDate },
            status: 'Approved',
        })
        .select('user startDate endDate status approvedBy')
        .lean();

        const regularizedDates = new Map();
        regularizations.forEach(reg => {
            const current = moment(reg.startDate);
            const end = moment(reg.endDate);
            while (current.isSameOrBefore(end)) {
                regularizedDates.set(current.format('DD-MM-YYYY'), reg.approvedBy || 'N/A');
                current.add(1, 'days');
            }
        });

        const totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
        let totalPresent = 0;
        let totalLeaves = 0;
        let totalPaidDays = 0;

        // Map attendance records to the data format required for PDF
        const attendanceData = attendanceRecords.map((record, index) => {
            // Parse the punchIn and punchOut times using moment
            const punchInTime = record.punchIn ? moment(record.punchIn) : null;
            const punchOutTime = record.punchOut ? moment(record.punchOut) : null;
        
            let attendanceStatus = 'Absent'; // Default to Absent
            let totalWorkingHours = record.totalWorkingHours || 'N/A'; // Keep original value or 'N/A'
        
            // Check if the record indicates that the shift was not marked end
            if (totalWorkingHours === 'Shift not marked end' || totalWorkingHours === 'Attendance Regularized') {
                // Mark as present if the shift is not marked end
                attendanceStatus = 'Present';
                totalWorkingHours = 'Shift not marked end'; // Keep it as is
            } else if (punchInTime && punchOutTime) {
                // Calculate the total working hours only if both punchIn and punchOut exist
                const duration = moment.duration(punchOutTime.diff(punchInTime));
                const hours = duration.hours(); // Get total hours
                const minutes = duration.minutes(); // Get remaining minutes
                totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`; // Format it in hours and minutes
        
                // Check attendance status based on total working hours
                if (hours >= 8) {
                    attendanceStatus = 'Present';  // Mark as Present if >= 8 hours
                } else if (hours < 8 && hours > 0) {
                    attendanceStatus = 'Half Day Present'; // Mark as Half Day Present if < 8 hours
                }
            }

            if (attendanceStatus === 'Present') {
                totalPresent += 1;
            } else if (attendanceStatus === 'Half Day Present') {
                totalPresent += 0.5;
            }
            const dateKey = moment(record.date).format('DD-MM-YYYY');
            // Return the attendance record with additional calculated fields
            return {
                serialNo: index + 1,
                image: record.image, // Assuming image data exists
                date: moment(record.date).format('DD-MM-YYYY'),
                punchIn: punchInTime ? punchInTime.format('hh:mm A') : 'N/A',
                punchOut: punchOutTime ? punchOutTime.format('hh:mm A') : 'N/A',
                totalWorkingHours: totalWorkingHours, // Keep the formatted total working hours
                status: attendanceStatus, // Add status field (Present, Half Day, Absent)
                attendanceRegularized: regularizedDates.has(dateKey) ? 'Yes' : 'No',
                approvedBy: regularizedDates.get(dateKey) || 'N/A',
            };
        });           

        // Log the formatted attendance data
        console.log('Formatted Attendance Data:', attendanceData);

        try {
            leaveRequests = await leaveService.getLeaveRequests(userId, req.user?.role);
            totalLeaves = leaveRequests.length;
        } catch (err) {
            console.error(`Error fetching leave requests for user ${userId}:`, err);
        }

        // Calculate total paid days
        totalPaidDays = totalPresent + totalLeaves;

        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            users: [{
                name: user.name || 'Unknown',
                email: user.email || 'Unknown',
                phone: user.phone || 'Unknown',
                position: user.position || 'Unknown',
                attendanceRecords: attendanceData, // Inject attendance data inside users
                summary: {
                    totalDays,
                    totalPresent,
                    totalLeaves,
                    totalPaidDays,
                },
            }],
        };

        // Log the report data before rendering
        console.log('Report Data:', reportData);

        // Path to your template
        const templatePath = path.join(__dirname, '..', 'templates', 'AttendanceReportUI.html');
        if (!fs.existsSync(templatePath)) {
            return res.status(500).json({ message: 'Template file missing' });
        }

        // Read template and compile it
        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        const template = handlebars.compile(templateSource);
        const htmlContent = template(reportData);

        // Log the HTML content being passed to Puppeteer
        console.log('Generated HTML Content:', htmlContent);

        // Generate PDF from HTML content using Puppeteer
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        if (deliveryMethod === 'download') {
            console.log('Delivery Method: Download');
            console.log('Sending PDF response for download...');
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename=attendance_report_${moment().format('YYYYMMDDHHmmss')}.pdf`
            );
            return res.end(pdfBuffer);
        } else if (deliveryMethod === 'email') {
            console.log('Delivery Method: Email');
            if (!finalRecipientEmail) {
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }

            const subject = 'Attendance Report';
            const name = req.user?.name || 'User';
            const message = 'Please find your attendance report attached to this email.';

            await sendEmailWithAttachment(finalRecipientEmail, { buffer: pdfBuffer }, { subject, name, message, fileType: 'pdf' });

            return res.status(200).json({ message: 'Attendance report emailed successfully.' });
        } else {
            return res.status(400).json({ message: 'Invalid delivery method.' });
        }
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({ message: 'Failed to generate the report.' });
    }
};

exports.generateUserTagsAttendanceHistoryPDF = async (req, res, userTags) => {
    try {
        const { startDate, endDate, deliveryMethod, recipientEmail } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        if (!deliveryMethod || !['download', 'email'].includes(deliveryMethod)) {
            return res.status(400).json({ message: 'Valid deliveryMethod (download or email) is required' });
        }

        const finalRecipientEmail = deliveryMethod === 'email' ? req.user?.email : recipientEmail;
        if (deliveryMethod === 'email' && !finalRecipientEmail) {
            return res.status(400).json({ message: 'Email is required when deliveryMethod is "email"' });
        }

        const users = await User.find({
            UserTags: { $in: userTags.map(tag => tag.trim()) }
        });

        if (!users.length) {
            return res.status(404).json({ message: 'No users found for the given tags' });
        }

        const usersData = await Promise.all(users.map(async (user) => {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id.toString(), startDate, endDate).catch(() => []);

            const regularizations = await AttendanceRegularization.find({
                user: user._id,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate },
                status: 'Approved',
            }).select('startDate endDate approvedBy').lean();

            const regularizedDates = new Map();
            regularizations.forEach(reg => {
                let current = moment(reg.startDate);
                let end = moment(reg.endDate);
                while (current.isSameOrBefore(end)) {
                    regularizedDates.set(current.format('DD-MM-YYYY'), reg.approvedBy);
                    current.add(1, 'days');
                }
            });

            let totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
            let totalPresent = 0;
            let totalLeaves = 0;
            let totalPaidDays = 0;

            const processedAttendanceRecords = attendanceRecords.map((record, index) => {
                const punchIn = record.punchIn ? moment(record.punchIn) : null;
                const punchOut = record.punchOut ? moment(record.punchOut) : null;
                let status = 'Absent';
                let totalWorkingHours = record.totalWorkingHours || 'N/A';

                if (totalWorkingHours === 'Shift not marked end' || record.attendanceRegularized === 'Yes') {
                    status = 'Present';
                    totalWorkingHours = '8 Hours';
                } else if (punchIn && punchOut) {
                    const duration = moment.duration(punchOut.diff(punchIn));
                    let hours = duration.hours();
                    let minutes = duration.minutes();

                    if (hours >= 8 || (hours === 7 && minutes >= 1) || hours > 8) {
                        hours = 8;
                        minutes = 0;
                    }

                    totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`;

                    if (hours >= 8) {
                        status = 'Present';
                    } else if (hours > 0) {
                        status = 'Half Day Present';
                    }
                }

                if (status === 'Present') totalPresent += 1;
                else if (status === 'Half Day Present') totalPresent += 0.5;

                const dateKey = moment(record.date).format('DD-MM-YYYY');
                if (regularizedDates.has(dateKey)) {
                    status = 'Regularized';
                    totalWorkingHours = '8 Hours';
                }

                return {
                    serialNo: index + 1,
                    image: record.image,
                    date: dateKey,
                    punchIn: punchIn ? punchIn.format('hh:mm A') : 'N/A',
                    punchOut: punchOut ? punchOut.format('hh:mm A') : 'N/A',
                    totalWorkingHours,
                    status,
                    attendanceRegularized: regularizedDates.has(dateKey) ? 'Yes' : 'No',
                    approvedBy: regularizedDates.get(dateKey) || 'N/A',
                };
            });

            try {
                const leaveRequests = await leaveService.getLeaveRequests(user._id, req.user?.role);
                totalLeaves = leaveRequests.length;
            } catch (err) {
                console.error(`Error fetching leave requests for user ${user._id}:`, err);
            }

            totalPaidDays = totalPresent + totalLeaves;

            return {
                name: user.name || 'Not provided',
                email: user.email || 'Not provided',
                phone: user.phone || 'Not provided',
                dateOfBirth: user.dateOfBirth ? moment(user.dateOfBirth).format('DD-MM-YYYY') : 'Not provided',
                fatherName: user.fatherName || 'Not provided',
                position: user.position || 'Not provided',
                employeeId: user.employeeId || 'Not provided',
                managerName: user.managerName || 'Not provided',
                managerRole: user.managerRole || 'Not provided',
                workLocation: user.workLocation || 'Not provided',
                plazaName: user.plazaName || 'Not provided',
                attendanceRecords: processedAttendanceRecords,
                summary: {
                    totalDays,
                    totalPresent,
                    totalLeaves,
                    totalPaidDays,
                },
            };
        }));

        const templatePath = path.join(__dirname, '..', 'templates', 'AttendanceReportUI.html');
        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        const template = handlebars.compile(templateSource);
        const htmlContent = template({ startDate, endDate, users: usersData });

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${moment().format('YYYYMMDDHHmmss')}.pdf`);
            return res.end(pdfBuffer);
        } else if (deliveryMethod === 'email') {
            await sendEmailWithAttachment(finalRecipientEmail, { buffer: pdfBuffer }, {
                subject: 'Attendance Report',
                name: req.user?.name || 'User',
                message: 'Please find your attendance report attached.',
                fileType: 'pdf',
            });
            return res.status(200).json({ message: 'Attendance report emailed successfully.' });
        } else {
            return res.status(400).json({ message: 'Invalid delivery method.' });
        }
    } catch (error) {
        console.error('Error generating PDF report:', error);
        res.status(500).json({ message: 'Failed to generate the report.' });
    }
};

exports.generateUserTagsAttendanceHistoryExcel = async (req, res, userTags) => {
    try {
        const currentUser = req.user;
        const { startDate, endDate, deliveryMethod, recipientEmail } = req.query;

        console.log(`Generating Excel report by user: ${currentUser.userId} (role: ${currentUser.role})`);
        console.log(`Tags: ${userTags}, Date Range: ${startDate} - ${endDate}, Delivery: ${deliveryMethod}`);

        if (![1, 2, 3].includes(currentUser.role) || (currentUser.role === 3 && !currentUser.manager)) {
            return res.status(403).json({ message: 'Permission denied to generate this report' });
        }

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        const finalRecipientEmail = deliveryMethod === 'email' ? req.user?.email : recipientEmail;
        if (deliveryMethod === 'email' && !finalRecipientEmail) {
            return res.status(400).json({ message: 'Recipient email is required for email delivery method' });
        }

        const users = await User.find({ UserTags: { $in: userTags.map(tag => tag.trim()) } }).lean();

        if (!users.length) {
            return res.status(404).json({ message: 'No users found for the given tags' });
        }

        console.log(`Users fetched: ${users.length}`);

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'VRSIIS HRM';
        workbook.created = new Date();

        for (const user of users) {
            console.log(`Processing user: ${user.name}`);

            const attendanceRecords = await this.getAttendanceByDateRange(user._id.toString(), startDate, endDate).catch(() => []);

            if (!attendanceRecords.length) {
                console.log(`No attendance records for ${user.name}`);
                continue;
            }

            let totalPresent = 0;
            let totalLeaves = 0;
            let totalPaidDays = 0;

            const worksheet = workbook.addWorksheet(user.name || 'User Attendance');

            const titleRow = worksheet.addRow(['User Tag Attendance History']);
            worksheet.mergeCells(`A${titleRow.number}:H${titleRow.number}`);
            titleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 16 };
            titleRow.alignment = { horizontal: 'center' };
            titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '25325F' } };

            const headerRow = worksheet.addRow([
                'S.No',
                'Date',
                'Image',
                'Punch In',
                'Punch Out',
                'Total Working Hours',
                'Status',
                'Regularized',
                'Approved By'
            ]);
            headerRow.font = { bold: true, color: { argb: 'FFFFFF' } };
            headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F7A832' } };
            headerRow.eachCell(cell => {
                cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
            });

            worksheet.columns = [
                { header: 'S.No', key: 'serialNo', width: 10 },
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Image', key: 'image', width: 20 },
                { header: 'Punch In', key: 'punchIn', width: 15 },
                { header: 'Punch Out', key: 'punchOut', width: 15 },
                { header: 'Total Working Hours', key: 'totalWorkingHours', width: 20 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'User Tag Attendance History', key: 'attendanceRegularized', width: 15 },
                { header: '', key: 'approvedBy', width: 20 },
            ];

            attendanceRecords.forEach((record, index) => {
                let status = 'Absent';
                const punchIn = record.punchIn ? moment(record.punchIn) : null;
                const punchOut = record.punchOut ? moment(record.punchOut) : null;
                let totalWorkingHours = record.totalWorkingHours || 'N/A';

                if (punchIn && punchOut) {
                    const duration = moment.duration(punchOut.diff(punchIn));
                    const hours = Math.floor(duration.asHours());
                    const minutes = duration.minutes();

                    totalWorkingHours = `${hours} Hours${minutes > 0 ? ` ${minutes} Minutes` : ''}`;
                    if (hours > 0 || minutes >= 1) status = 'Present';
                    else status = 'Absent';
                } else if (punchIn || record.attendanceRegularized) {
                    totalWorkingHours = punchIn ? 'Shift Not Marked End' : 'N/A';
                    status = 'Present';
                }

                if (status === 'Present') totalPresent += 1;
                if (status === 'Half Day Present') totalPresent += 0.5;

                const row = worksheet.addRow({
                    serialNo: index + 1,
                    date: moment(record.date).format('DD-MM-YYYY'),
                    image: '',
                    punchIn: punchIn ? punchIn.format('hh:mm A') : 'N/A',
                    punchOut: punchOut ? punchOut.format('hh:mm A') : 'N/A',
                    totalWorkingHours,
                    status,
                    attendanceRegularized: record.attendanceRegularized ? 'Yes' : 'No',
                    approvedBy: record.approvedBy || 'N/A',
                });

                const currentRowIndex = row.number;

                if (record.image) {
                    const imageBuffer = Buffer.from(record.image.split(',')[1], 'base64');
                    const imageId = workbook.addImage({
                        buffer: imageBuffer,
                        extension: 'jpeg',
                    });
                
                    // Set proper height and width for consistent appearance
                    worksheet.getRow(currentRowIndex).height = 80;
                    worksheet.getColumn(3).width = 25;
                
                    // Adjust image placement within the single cell
                    worksheet.addImage(imageId, {
                        tl: { col: 2, row: currentRowIndex - 1 },  // Fine-tuned placement
                        ext: { width: 100, height: 80 },               // Adjust dimensions for better fit
                        editAs: 'oneCell',
                    });
                }                
            });

            try {
                const leaveRequests = await leaveService.getLeaveRequests(user._id, user.role);
                totalLeaves = leaveRequests.length;
            } catch (err) {
                console.error(`Error fetching leave requests for ${user.name}:`, err);
            }

            totalPaidDays = totalPresent + totalLeaves;

            worksheet.addRow([]);
            const summaryTitleRow = worksheet.addRow(['Summary']);
            worksheet.mergeCells(`A${summaryTitleRow.number}:B${summaryTitleRow.number}`);
            summaryTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
            summaryTitleRow.alignment = { horizontal: 'center' };
            summaryTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '25325F' } };
            worksheet.addRow(['Total Days', attendanceRecords.length]);
            worksheet.addRow(['Total Present', totalPresent]);
            worksheet.addRow(['Total Leaves', totalLeaves]);
            worksheet.addRow(['Total Paid Days', totalPaidDays]);
        }

        const buffer = await workbook.xlsx.writeBuffer();

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${moment().format('YYYYMMDDHHmmss')}.xlsx`);
            res.end(buffer);
        } else if (deliveryMethod === 'email') {
            await sendxlsxEmailWithAttachment(finalRecipientEmail, { buffer }, {
                subject: 'Attendance Report (Excel)',
                name: req.user?.name || 'User',
                message: 'Please find your attendance report attached in Excel format.',
                fileType: 'xlsx',
            });
            return res.status(200).json({ message: 'Attendance report emailed successfully.' });
        }
    } catch (error) {
        console.error('Error generating Excel report:', error);
        res.status(500).json({ message: 'Failed to generate the Excel report.' });
    }
};

exports.generateAttendanceReportByPlaza = async (startDate, endDate, plazaName, req, res, deliveryMethod, recipientEmail) => {
    try {
        console.log(`\n🔹 [START] Generating Attendance Report`);
        console.log(`📅 Start Date: ${startDate}, End Date: ${endDate}`);
        console.log(`🏢 Plaza Name: "${plazaName}"`);
        console.log(`📤 Delivery Method: ${deliveryMethod}`);
        console.log(`📧 Recipient Email: ${recipientEmail || 'N/A'}`);

        if (!startDate || !endDate || !plazaName) {
            console.error('❌ Missing required parameters: Start date, end date, or plaza name.');
            return res.status(400).json({ message: 'Start date, end date, and plaza name are required.' });
        }

        const normalizedDeliveryMethod = (deliveryMethod || '').toLowerCase();
        if (!['download', 'email'].includes(normalizedDeliveryMethod)) {
            console.error('❌ Invalid delivery method:', deliveryMethod);
            return res.status(400).json({ message: 'Invalid delivery method. Use "download" or "email".' });
        }

        console.log(`📌 Fetching attendance records for plaza: "${plazaName}"...`);
        const attendanceRecords = await Attendance.find({
            plazaName: { $regex: new RegExp(`^${plazaName.trim()}$`, 'i') },
            date: { $gte: startDate, $lte: endDate }
        }).sort({ userId: 1 });

        if (attendanceRecords.length === 0) {
            console.warn(`⚠️ No attendance records found for the specified plaza: "${plazaName}"`);
            return res.status(404).json({ message: 'No attendance records found for the specified plaza.' });
        }

        const userIds = [...new Set(attendanceRecords.map(record => record.userId))];
        const users = await User.find({ _id: { $in: userIds } }).sort({ _id: 1 });
        let serialCounter = 1;
        let totalDays = moment(endDate).diff(moment(startDate), 'days') + 1;
        let totalPresent = 0;
        let totalLeaves = 0;
        let totalAbsent = 0;
        let totalRegularized = 0;
        let totalPaidDays = 0;

        console.log(`🔍 Processing ${users.length} users and ${attendanceRecords.length} attendance records...`);
        const processedUsers = await Promise.all(
            users.map(async (user) => {
                const records = attendanceRecords.filter(record => record.userId.toString() === user._id.toString());

                const regularizations = await AttendanceRegularization.find({
                    user: user._id,
                    startDate: { $lte: endDate },
                    endDate: { $gte: startDate },
                    status: 'Approved',
                }).select('startDate endDate approvedBy').lean();

                const regularizedDates = new Map();
                regularizations.forEach(reg => {
                    let current = moment(reg.startDate);
                    let end = moment(reg.endDate);
                    while (current.isSameOrBefore(end)) {
                        regularizedDates.set(current.format('DD-MM-YYYY'), reg.approvedBy);
                        current.add(1, 'days');
                    }
                });

                const attendanceData = records.map(record => {
                    const formattedDate = moment(record.date).format('DD-MM-YYYY');
                    const status = 'Present';
                    const regularized = regularizedDates.has(formattedDate) ? 'Yes' : 'No';
                    const approvedBy = regularizedDates.get(formattedDate) || 'N/A';

                    let totalWorkingHours = 'No working hours';
                    if (record.punchIn) {
                        if (record.punchOut) {
                            const duration = moment.duration(moment(record.punchOut).diff(moment(record.punchIn)));
                            const totalHours = Math.floor(duration.asHours());
                            const totalMinutes = duration.minutes();
                            const totalSeconds = duration.seconds();
                            totalWorkingHours = `${totalHours}h ${totalMinutes}m ${totalSeconds}s`;
                        } else {
                            totalWorkingHours = 'Shift not marked end';
                        }
                    }

                    if (status === 'Present') totalPresent++;
                    else totalAbsent++;

                    if (regularized === 'Yes') {
                        totalRegularized++;
                        console.log(`📧 Regularized attendance for ${formattedDate} approved by ${approvedBy}, User Email: ${user?.email || 'N/A'}`);
                    }

                    const base64Image = record.image ? `data:image/jpeg;base64,${record.image}` : null;

                    console.log(`📅 Date: ${formattedDate} | Status: ${status} | Punch In: ${record.punchIn ? moment(record.punchIn).format('hh:mm:ss A') : 'N/A'} | Punch Out: ${record.punchOut ? moment(record.punchOut).format('hh:mm:ss A') : 'N/A'} | Total Working Hours: ${totalWorkingHours} | Regularized: ${regularized} | Approved By: ${approvedBy}`);

                    return {
                        serialNo: serialCounter++,
                        image: base64Image,
                        date: formattedDate,
                        punchIn: record.punchIn ? moment(record.punchIn).format('hh:mm:ss A') : 'N/A',
                        punchOut: record.punchOut ? moment(record.punchOut).format('hh:mm:ss A') : 'N/A',
                        totalWorkingHours,
                        status,
                        attendanceRegularized: regularized,
                        approvedBy: approvedBy
                    };
                });

                try {
                    const leaveRequests = await leaveService.getLeaveRequests(user._id, req.user?.role);
                    totalLeaves = leaveRequests.length;
                } catch (err) {
                    console.error(`Error fetching leave requests for user ${user._id}:`, err);
                }
    
                totalPaidDays = totalPresent + totalLeaves;    

                return {
                    serialNo: serialCounter++,
                    name: user?.name || 'Unknown',
                    email: user?.email || 'N/A',
                    phone: user?.phone || 'N/A',
                    dateOfBirth: user?.dateOfBirth ? moment(user.dateOfBirth).format('DD-MM-YYYY') : 'Not provided',
                    fatherName: user?.fatherName || 'Not provided',
                    position: user?.position || 'Not provided',
                    employeeId: user?.employeeId || 'N/A',
                    managerName: user?.managerName || 'Not provided',
                    managerRole: user?.managerRole || 'Not provided',
                    workLocation: user?.workLocation || 'Not provided',
                    plazaName: user?.plazaName || 'Not provided',
                    attendanceRecords: attendanceData,
                    summary: {
                        totalDays,
                        totalPresent,
                        totalLeaves,
                        totalPaidDays,
                    },
                };
            })
        );

        console.log(`📌 Final Summary: Total Users: ${users.length}, Present: ${totalPresent}, Absent: ${totalAbsent}, Regularized: ${totalRegularized}`);
        const summary = { totalUsers: users.length, totalPresent, totalAbsent, totalRegularized };

        console.log('✅ Attendance Data Processed Successfully.');
        const reportData = { startDate, endDate, users: processedUsers, summary };

        console.log('📌 Compiling HTML report template...');
        const htmlContent = handlebars.compile(fs.readFileSync('templates/AttendanceReportUI.html', 'utf-8'))(reportData);

        console.log('🚀 Generating PDF Report...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        console.log('✅ PDF Report Generated Successfully.');

        if (normalizedDeliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${plazaName.trim()}.pdf`);
            return res.end(pdfBuffer);
        } else if (normalizedDeliveryMethod === 'email') {
            if (!recipientEmail) {
                recipientEmail = req.user?.email;
            }
            if (!recipientEmail) {
                console.error('❌ Recipient email is missing for email delivery.');
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }
            await sendEmailWithAttachment(recipientEmail, { buffer: pdfBuffer }, {
                subject: 'Attendance History Report By Plaza Name',
                name: req.user?.name || 'User',
                message: 'Your attendance report is attached.',
                fileType: 'pdf'
            });
            console.log('📨 Email sent successfully!');
            return res.status(200).json({ message: 'Attendance report emailed successfully.' });
        }
    } catch (error) {
        console.error('❌ Error generating attendance report:', error);
        return res.status(500).json({ message: 'Failed to generate the report.' });
    }
};

exports.generatePlazaAttendanceHistoryExcel = async (req, res) => {
    try {
        const { startDate, endDate, plazaName, deliveryMethod, recipientEmail } = req.query;

        console.log(`\n🔹 [START] Generating Plaza Attendance Excel Report`);
        console.log(`📅 Start Date: ${startDate}, End Date: ${endDate}`);
        console.log(`🏢 Plaza Name: "${plazaName}"`);
        console.log(`📤 Delivery Method: ${deliveryMethod}`);
        console.log(`📧 Recipient Email: ${recipientEmail || 'N/A'}`);

        if (!startDate || !endDate || !plazaName) {
            console.error('❌ Missing required parameters: Start date, end date, or plaza name.');
            return res.status(400).json({ message: 'Start date, end date, and plaza name are required.' });
        }

        const attendanceRecords = await Attendance.find({
            plazaName: { $regex: new RegExp(`^${plazaName.trim()}$`, 'i') },
            date: { $gte: startDate, $lte: endDate }
        }).sort({ userId: 1 });

        if (!attendanceRecords.length) {
            console.warn(`⚠️ No attendance records found for the specified plaza: "${plazaName}"`);
            return res.status(404).json({ message: 'No attendance records found for the specified plaza.' });
        }

        const userIds = [...new Set(attendanceRecords.map(record => record.userId))];
        const users = await User.find({ _id: { $in: userIds } }).sort({ _id: 1 });

        const workbook = new ExcelJS.Workbook();
        workbook.creator = 'VRSIIS HRM';
        workbook.created = new Date();

        for (const user of users) {
            console.log(`Processing user: ${user.name}`);

            const userAttendance = attendanceRecords.filter(record => record.userId.toString() === user._id.toString());
            if (!userAttendance.length) continue;

            let totalPresent = 0, totalLeaves = 0, totalPaidDays = 0;

            const worksheet = workbook.addWorksheet(user.name || 'Plaza Attendance');
            const title = 'Plaza Attendance History';
            const titleRow = worksheet.addRow([title]);
            console.log(`📄 Worksheet Title: ${title}`);

            worksheet.mergeCells(`A${titleRow.number}:I${titleRow.number}`);
            titleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 16 };
            titleRow.alignment = { horizontal: 'center' };
            titleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '25325F' } };

            worksheet.addRow([]);

            const columnHeaders = [
                'S.No',
                'Date',
                'Image',
                'Punch In',
                'Punch Out',
                'Total Working Hours',
                'Status',
                'Regularized',
                'Approved By'
            ];

            worksheet.addRow(columnHeaders).eachCell(cell => {
                cell.font = { bold: true, color: { argb: 'FFFFFF' } };
                cell.alignment = { horizontal: 'center' };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '25325F' } };
            });

            worksheet.columns = [
                { key: 'serialNo', width: 10 },
                { key: 'date', width: 15 },
                { key: 'image', width: 20 },
                { key: 'punchIn', width: 15 },
                { key: 'punchOut', width: 15 },
                { key: 'totalWorkingHours', width: 20 },
                { key: 'status', width: 15 },
                { key: 'attendanceRegularized', width: 15 },
                { key: 'approvedBy', width: 20 },
            ];

            for (const [index, record] of userAttendance.entries()) {
                let status = 'Absent';
                let totalWorkingHours = 'N/A';
                const punchIn = record.punchIn ? moment(record.punchIn) : null;
                const punchOut = record.punchOut ? moment(record.punchOut) : null;

                if (punchIn) {
                    if (punchOut) {
                        const duration = moment.duration(punchOut.diff(punchIn));
                        const hours = Math.floor(duration.asHours());
                        const minutes = duration.minutes();
                        const seconds = duration.seconds();
                        totalWorkingHours = `${hours}h ${minutes}m ${seconds}s`;
                
                        // ✅ Mark Present even if hours, minutes, or seconds > 0
                        if (hours > 0 || minutes > 0 || seconds > 0) status = 'Present';
                        else status = 'Absent';
                    } else {
                        // ✅ Punch in time available but punch out is N/A, mark Present
                        totalWorkingHours = 'N/A';
                        status = 'Present';
                    }
                } else {
                    status = 'Absent';
                }
                

                if (status === 'Present') totalPresent++;

                const row = worksheet.addRow({
                    serialNo: index + 1,
                    date: moment(record.date).format('DD-MM-YYYY'),
                    image: record.image,
                    punchIn: punchIn ? punchIn.format('hh:mm A') : 'N/A',
                    punchOut: punchOut ? punchOut.format('hh:mm A') : 'N/A',
                    totalWorkingHours,
                    status,
                    attendanceRegularized: record.attendanceRegularized ? 'Yes' : 'No',
                    approvedBy: record.approvedBy || 'N/A',
                });

                const currentRowIndex = row.number;

                if (record.imageBase64) {
                    console.log(`🖼️ Image found for user: ${user.name}, Record Date: ${moment(record.date).format('DD-MM-YYYY')}`);
                    console.log(`📝 Image Base64 Length: ${record.imageBase64.length}`);
                
                    try {
                        let base64Data = record.imageBase64;
                
                        // ✅ Add prefix if missing
                        if (!base64Data.startsWith('data:image/')) {
                            base64Data = `data:image/jpeg;base64,${base64Data}`;
                        }
                
                        // ✅ Extract base64 without prefix
                        const base64WithoutPrefix = base64Data.replace(/^data:image\/\w+;base64,/, '');
                        const imageBuffer = Buffer.from(base64WithoutPrefix, 'base64');
                        console.log(`✅ Image buffer created. Buffer length: ${imageBuffer.length}`);
                
                        // ✅ Dynamic extension handling
                        const extension = base64Data.includes('image/png') ? 'png' : 'jpeg';
                
                        const imageId = workbook.addImage({
                            buffer: imageBuffer,
                            extension: extension,
                        });
                
                        if (imageId) {
                            console.log(`🆔 Image ID generated successfully: ${imageId}`);
                        } else {
                            console.warn(`⚠️ Failed to generate image ID for user: ${user.name}`);
                        }
                
                        worksheet.getRow(currentRowIndex).height = 80;
                        worksheet.getColumn(3).width = 25;
                        worksheet.addImage(imageId, {
                            tl: { col: 2, row: currentRowIndex - 1 },
                            ext: { width: 100, height: 80 },
                            editAs: 'oneCell',
                        });
                
                        console.log(`✅ Image added successfully for user: ${user.name} at row: ${currentRowIndex}`);
                    } catch (imgErr) {
                        console.error(`❌ Error processing image for user: ${user.name}`, imgErr);
                    }
                } else {
                    console.log(`🚫 No image found for user: ${user.name}, Record Date: ${moment(record.date).format('DD-MM-YYYY')}`);
                }                                       
            }

            const leaveRequests = await leaveService.getLeaveRequests(user._id, req.user?.role);
            totalLeaves = leaveRequests.length;
            totalPaidDays = totalPresent + totalLeaves;

            worksheet.addRow([]);
            const summaryTitleRow = worksheet.addRow(['Summary']);
            worksheet.mergeCells(`A${summaryTitleRow.number}:B${summaryTitleRow.number}`);
            summaryTitleRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 14 };
            summaryTitleRow.alignment = { horizontal: 'center' };
            summaryTitleRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '25325F' } };

            worksheet.addRow(['Total Days', userAttendance.length]);
            worksheet.addRow(['Total Present', totalPresent]);
            worksheet.addRow(['Total Leaves', totalLeaves]);
            worksheet.addRow(['Total Paid Days', totalPaidDays]);
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const fileName = `plaza_attendance_report_${moment().format('YYYYMMDDHHmmss')}.xlsx`;

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
            res.end(buffer);
        } else if (deliveryMethod === 'email') {
            const finalRecipient = recipientEmail || req.user?.email;
            if (!finalRecipient) {
                return res.status(400).json({ message: 'Recipient email is required for email delivery method' });
            }
            await sendxlsxEmailWithAttachment(finalRecipient, { buffer }, {
                subject: 'Plaza Attendance Report (Excel)',
                name: req.user?.name || 'User',
                message: 'Please find the plaza attendance report attached in Excel format.',
                fileType: 'xlsx',
            });
            return res.status(200).json({ message: 'Plaza attendance report emailed successfully.' });
        }
    } catch (error) {
        console.error('❌ Error generating Plaza Excel report:', error);
        return res.status(500).json({ message: 'Failed to generate the Plaza Excel report.' });
    }
};

exports.generateAllUsersAttendanceSummaryPDF = async (startDate, endDate, req, res, deliveryMethod, recipientEmail) => {
    try {
        console.log(`🔹 Start Date: ${startDate}, End Date: ${endDate}`);
        console.log(`🔹 Delivery Method: ${deliveryMethod}`);
        console.log(`🔹 Recipient Email: ${recipientEmail || 'N/A'}`);

        const normalizedDeliveryMethod = (deliveryMethod || '').toLowerCase();
        if (!['download', 'email'].includes(normalizedDeliveryMethod)) {
            console.error(`❌ Invalid delivery method: ${normalizedDeliveryMethod}`);
            return res.status(400).json({ message: 'Invalid delivery method.' });
        }

        console.log('📌 Fetching users...');
        const users = await User.find({}).lean();
        console.log(`✅ Total users found: ${users.length}`);

        if (!users.length) {
            console.warn('⚠️ No users found.');
            return res.status(404).json({ message: 'No users found' });
        }

        const templatePath = path.join(__dirname, '..', 'templates', 'AllUsersSummaryReportUI.html');
        console.log(`📄 Template Path: ${templatePath}`);
        let templateSource;
        try {
            templateSource = fs.readFileSync(templatePath, 'utf-8');
            console.log('✅ Template loaded successfully.');
        } catch (templateError) {
            console.error('❌ Error reading template file:', templateError);
            throw new Error('Template file not found or inaccessible.');
        }
        const template = handlebars.compile(templateSource);

        console.log('🛠 Processing users data for the summary report...');
        const usersSummaryData = await Promise.all(users.map(async (user) => {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id, startDate, endDate);
            const regularizations = await AttendanceRegularization.find({
                user: user._id,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate },
                status: 'Approved'
            }).lean();

            const totalDays = attendanceRecords.length;
            const presentDays = attendanceRecords.filter(r => r.present === 'Yes' || r.present === 'Attendance Regularized').length;
            const absentDays = totalDays - presentDays;
            const totalWorkingHours = attendanceRecords.reduce((acc, r) => {
                if (r.totalWorkingHours && r.totalWorkingHours !== 'No working hours' && r.totalWorkingHours !== 'Attendance Regularized') {
                    const [hours, minutes] = r.totalWorkingHours.split(' ').filter((_, i) => i % 2 === 0);
                    acc += parseInt(hours) + (parseInt(minutes) / 60 || 0);
                }
                return acc;
            }, 0);

            const averageWorkingHours = presentDays ? (totalWorkingHours / presentDays).toFixed(2) : 0;
            const compliance = totalDays ? ((presentDays / totalDays) * 100).toFixed(2) : 0;
            const totalRegularizations = regularizations.length;

            return {
                name: user.name,
                fatherName: user.fatherName || 'N/A',
                email: user.email,
                employeeId: user.employeeId || 'N/A',
                plazaName: user.plazaName || 'N/A',
                totalDays,
                presentDays,
                totalLeaves: totalDays - presentDays - absentDays,
                totalPaidDays: presentDays + totalRegularizations,
                absentDays,
                totalWorkingHours: totalWorkingHours.toFixed(2),
                averageWorkingHours,
                regularizations: totalRegularizations,
                compliance
            };
        }));

        console.log('✅ User summary data processed.');
        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            users: usersSummaryData
        };

        const htmlContent = template(reportData);
        console.log('✅ HTML content generated.');

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        console.log('📄 Generating PDF...');
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename=all_users_summary_report_${moment().format('YYYYMMDDHHmmss')}.pdf`
            );
            return res.end(pdfBuffer);
        } else if (deliveryMethod === 'email') {
            if (!recipientEmail) {
                recipientEmail = req.user?.email;
            }

            if (!recipientEmail) {
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }

            const subject = 'All Users Attendance Summary Report';
            const name = req.user?.name || 'User';
            const message = 'Please find attached the attendance summary report for all users.';

            await sendEmailWithAttachment(recipientEmail, { buffer: pdfBuffer }, { subject, name, message, fileType: 'pdf' });
            console.log('✅ Email sent successfully.');
            return res.status(200).json({ message: 'Attendance summary report emailed successfully.' });
        }
    } catch (error) {
        console.error('❌ Error generating attendance summary PDF:', error);
        res.status(500).json({ message: 'Failed to generate the attendance summary report.' });
    }
};

exports.generateAllUsersAttendanceSummaryExcel = async (startDate, endDate, req, res, deliveryMethod, recipientEmail) => {
    try {
        console.log(`🔹 Start Date: ${startDate}, End Date: ${endDate}`);
        console.log(`🔹 Delivery Method: ${deliveryMethod}`);
        console.log(`🔹 Recipient Email: ${recipientEmail || 'N/A'}`);

        const normalizedDeliveryMethod = (deliveryMethod || '').toLowerCase();
        if (!['download', 'email'].includes(normalizedDeliveryMethod)) {
            console.error(`❌ Invalid delivery method: ${normalizedDeliveryMethod}`);
            return res.status(400).json({ message: 'Invalid delivery method.' });
        }

        console.log('📌 Fetching users...');
        const users = await User.find({}).lean();
        console.log(`✅ Total users found: ${users.length}`);

        if (!users.length) {
            console.warn('⚠️ No users found.');
            return res.status(404).json({ message: 'No users found' });
        }

        console.log('🛠 Processing users data for the summary report...');
        const usersSummaryData = await Promise.all(users.map(async (user) => {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id, startDate, endDate);
            const regularizations = await AttendanceRegularization.find({
                user: user._id,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate },
                status: 'Approved'
            }).lean();

            const totalDays = attendanceRecords.length;
            const presentDays = attendanceRecords.filter(r => r.present === 'Yes' || r.present === 'Attendance Regularized').length;
            const absentDays = totalDays - presentDays;
            const totalWorkingHours = attendanceRecords.reduce((acc, r) => {
                if (r.totalWorkingHours && r.totalWorkingHours !== 'No working hours' && r.totalWorkingHours !== 'Attendance Regularized') {
                    const [hours, minutes] = r.totalWorkingHours.split(' ').filter((_, i) => i % 2 === 0);
                    acc += parseInt(hours) + (parseInt(minutes) / 60 || 0);
                }
                return acc;
            }, 0);

            const averageWorkingHours = presentDays ? (totalWorkingHours / presentDays).toFixed(2) : 0;
            const compliance = totalDays ? ((presentDays / totalDays) * 100).toFixed(2) : 0;
            const totalRegularizations = regularizations.length;

            return {
                name: user.name,
                fatherName: user.fatherName || 'N/A',
                email: user.email,
                employeeId: user.employeeId || 'N/A',
                plazaName: user.plazaName || 'N/A',
                totalDays,
                presentDays,
                totalLeaves: totalDays - presentDays - absentDays,
                totalPaidDays: presentDays + totalRegularizations,
                absentDays,
                totalWorkingHours: totalWorkingHours.toFixed(2),
                averageWorkingHours,
                regularizations: totalRegularizations,
                compliance
            };
        }));

        console.log('✅ User summary data processed.');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Summary');

        worksheet.columns = [
            { header: 'NAME', key: 'name' },
            { header: 'FATHER NAME', key: 'fatherName' },
            { header: 'EMAIL', key: 'email' },
            { header: 'EMP CODE', key: 'employeeId' },
            { header: 'PLAZA NAME', key: 'plazaName' },
            { header: 'TOTAL DAYS', key: 'totalDays' },
            { header: 'TOTAL PRESENT DAYS', key: 'presentDays' },
            { header: 'TOTAL LEAVE', key: 'totalLeaves' },
            { header: 'TOTAL PAID DAYS', key: 'totalPaidDays' },
            { header: 'ABSENT DAYS', key: 'absentDays' },
            { header: 'TOTAL WORKING HOURS', key: 'totalWorkingHours' },
            { header: 'AVERAGE WORKING HOURS/DAY', key: 'averageWorkingHours' },
            { header: 'REGULARIZATIONS', key: 'regularizations' },
            { header: 'ATTENDANCE COMPLIANCE (%)', key: 'compliance' }
        ];

        worksheet.getRow(1).eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '25325F' }
            };
            cell.font = { color: { argb: 'F7A832' }, bold: true };
        });

        usersSummaryData.forEach(user => worksheet.addRow(user));

        const buffer = await workbook.xlsx.writeBuffer();
        console.log('✅ Excel file generated.');

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=all_users_summary_report_${moment().format('YYYYMMDDHHmmss')}.xlsx`);
            return res.end(buffer);
        } else if (deliveryMethod === 'email') {
            if (!recipientEmail) {
                recipientEmail = req.user?.email;
            }

            if (!recipientEmail) {
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }

            const subject = 'All Users Attendance Summary Report (Excel)';
            const name = req.user?.name || 'User';
            const message = 'Please find attached the Excel attendance summary report for all users.';

            await sendEmailWithAttachment(recipientEmail, { buffer }, { subject, name, message, fileType: 'xlsx' });
            console.log('✅ Email sent successfully.');
            return res.status(200).json({ message: 'Attendance summary Excel report emailed successfully.' });
        }
    } catch (error) {
        console.error('❌ Error generating attendance summary Excel:', error);
        res.status(500).json({ message: 'Failed to generate the attendance summary Excel report.' });
    }
};

exports.generateUserTagsAttendanceSummaryPDF = async (req, res, userTags) => {
    try {
        const { startDate, endDate, deliveryMethod } = req.query;
        let { recipientEmail } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        if (!deliveryMethod || !['download', 'email'].includes(deliveryMethod)) {
            return res.status(400).json({ message: 'Valid deliveryMethod (download or email) is required' });
        }

        console.log('📌 Fetching users by tags...');
        const users = await User.find({
            UserTags: { $in: userTags.map(tag => tag.trim()) }
        }).lean();

        console.log(`✅ Total users found: ${users.length}`);
        if (!users.length) {
            return res.status(404).json({ message: 'No users found for the given tags' });
        }

        console.log('🛠 Processing users data for the summary report...');
        const usersSummaryData = await Promise.all(users.map(async (user) => {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id, startDate, endDate) || [];
            const regularizations = await AttendanceRegularization.find({
                user: user._id,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate },
                status: 'Approved'
            }).lean();

            const totalDays = attendanceRecords.length || 0;
            const presentDays = attendanceRecords.filter(r => r.present === 'Yes' || r.present === 'Attendance Regularized').length || 0;
            const absentDays = totalDays - presentDays;
            const totalRegularizations = regularizations.length || 0;

            const totalWorkingHours = attendanceRecords.reduce((acc, r) => {
                if (r.totalWorkingHours && r.totalWorkingHours !== 'No working hours' && r.totalWorkingHours !== 'Attendance Regularized') {
                    const [hours, minutes] = r.totalWorkingHours.split(' ').filter((_, i) => i % 2 === 0);
                    acc += (parseInt(hours) || 0) + ((parseInt(minutes) || 0) / 60);
                }
                return acc;
            }, 0);

            const averageWorkingHours = presentDays ? (totalWorkingHours / presentDays).toFixed(2) : "NaN";
            const compliance = totalDays ? ((presentDays / totalDays) * 100).toFixed(2) : "NaN";

            return {
                name: user.name || "NaN",
                fatherName: user.fatherName || "NaN",
                email: user.email || "NaN",
                employeeId: user.employeeId || "NaN",
                totalDays: totalDays || "NaN",
                presentDays: presentDays || "NaN",
                totalLeaves: totalDays - presentDays - absentDays || "NaN",
                totalPaidDays: presentDays + totalRegularizations || "NaN",
                absentDays: absentDays || "NaN",
                totalWorkingHours: totalWorkingHours ? totalWorkingHours.toFixed(2) : "NaN",
                averageWorkingHours,
                regularizations: totalRegularizations || "NaN",
                compliance
            };
        }));

        console.log('✅ User summary data processed.');
        const templatePath = path.join(__dirname, '..', 'templates', 'UserTagsSummaryReportUI.html');
        const templateSource = fs.readFileSync(templatePath, 'utf-8');
        const template = handlebars.compile(templateSource);

        const htmlContent = template({
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            userTags: userTags.join(', '),
            users: usersSummaryData
        });

        console.log('📄 Generating PDF...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=user_tags_summary_report_${moment().format('YYYYMMDDHHmmss')}.pdf`);
            return res.end(pdfBuffer);
        } else if (deliveryMethod === 'email') {
            if (!recipientEmail) {
                recipientEmail = req.user?.email;
            }

            if (!recipientEmail) {
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }

            await sendEmailWithAttachment(recipientEmail, { buffer: pdfBuffer }, {
                subject: 'User Tags Attendance Summary Report',
                name: req.user?.name || 'User',
                message: 'Please find attached the attendance summary report for selected user tags.',
                fileType: 'pdf',
            });
            console.log('✅ Email sent successfully.');
            return res.status(200).json({ message: 'Attendance summary report emailed successfully.' });
        }
    } catch (error) {
        console.error('❌ Error generating attendance summary PDF:', error);
        res.status(500).json({ message: 'Failed to generate the attendance summary report.' });
    }
};

exports.generateUserTagsAttendanceSummaryExcel = async (req, res, userTags) => {
    try {
        const { startDate, endDate, deliveryMethod } = req.query;
        let { recipientEmail } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ message: 'Start date and end date are required' });
        }

        if (!deliveryMethod || !['download', 'email'].includes(deliveryMethod)) {
            return res.status(400).json({ message: 'Valid deliveryMethod (download or email) is required' });
        }

        console.log('📌 Fetching users by tags...');
        const users = await User.find({
            UserTags: { $in: userTags.map(tag => tag.trim()) }
        }).lean();

        console.log(`✅ Total users found: ${users.length}`);
        if (!users.length) {
            return res.status(404).json({ message: 'No users found for the given tags' });
        }

        console.log('🛠 Processing users data for the summary report...');
        const usersSummaryData = await Promise.all(users.map(async (user) => {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id, startDate, endDate) || [];
            const regularizations = await AttendanceRegularization.find({
                user: user._id,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate },
                status: 'Approved'
            }).lean();

            const totalDays = attendanceRecords.length || 0;
            const presentDays = attendanceRecords.filter(r => r.present === 'Yes' || r.present === 'Attendance Regularized').length || 0;
            const absentDays = totalDays - presentDays;
            const totalRegularizations = regularizations.length || 0;

            const totalWorkingHours = attendanceRecords.reduce((acc, r) => {
                if (r.totalWorkingHours && r.totalWorkingHours !== 'No working hours' && r.totalWorkingHours !== 'Attendance Regularized') {
                    const [hours, minutes] = r.totalWorkingHours.split(' ').filter((_, i) => i % 2 === 0);
                    acc += (parseInt(hours) || 0) + ((parseInt(minutes) || 0) / 60);
                }
                return acc;
            }, 0);

            const averageWorkingHours = presentDays ? (totalWorkingHours / presentDays).toFixed(2) : "NaN";
            const compliance = totalDays ? ((presentDays / totalDays) * 100).toFixed(2) : "NaN";

            return {
                name: user.name || "NaN",
                fatherName: user.fatherName || "NaN",
                email: user.email || "NaN",
                employeeId: user.employeeId || "NaN",
                totalDays: totalDays || "NaN",
                presentDays: presentDays || "NaN",
                totalLeaves: totalDays - presentDays - absentDays || "NaN",
                totalPaidDays: presentDays + totalRegularizations || "NaN",
                absentDays: absentDays || "NaN",
                totalWorkingHours: totalWorkingHours ? totalWorkingHours.toFixed(2) : "NaN",
                averageWorkingHours,
                regularizations: totalRegularizations || "NaN",
                compliance
            };
        }));

        console.log('📄 Generating Excel file...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Summary');
        
        worksheet.columns = [
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Father Name', key: 'fatherName', width: 20 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Employee ID', key: 'employeeId', width: 15 },
            { header: 'Total Days', key: 'totalDays', width: 10 },
            { header: 'Present Days', key: 'presentDays', width: 12 },
            { header: 'Total Leaves', key: 'totalLeaves', width: 12 },
            { header: 'Total Paid Days', key: 'totalPaidDays', width: 12 },
            { header: 'Absent Days', key: 'absentDays', width: 12 },
            { header: 'Total Working Hours', key: 'totalWorkingHours', width: 18 },
            { header: 'Average Working Hours', key: 'averageWorkingHours', width: 20 },
            { header: 'Regularizations', key: 'regularizations', width: 15 },
            { header: 'Compliance (%)', key: 'compliance', width: 15 }
        ];

        worksheet.getRow(1).eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '25325F' }
            };
            cell.font = { color: { argb: 'F7A832' }, bold: true };
        });

        worksheet.addRows(usersSummaryData);

        const buffer = await workbook.xlsx.writeBuffer();
        
        if (deliveryMethod === 'download') {
            res.setHeader('Content-Disposition', `attachment; filename=user_tags_summary_${moment().format('YYYYMMDDHHmmss')}.xlsx`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            return res.end(buffer);
        } else if (deliveryMethod === 'email') {
            if (!recipientEmail) {
                recipientEmail = req.user?.email;
            }

            if (!recipientEmail) {
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }

            await sendEmailWithAttachment(recipientEmail, { buffer }, {
                subject: 'User Tags Attendance Summary Report',
                name: req.user?.name || 'User',
                message: 'Please find attached the attendance summary report for selected user tags.',
                fileType: 'xlsx',
            });
            console.log('✅ Email sent successfully.');
            return res.status(200).json({ message: 'Attendance summary report emailed successfully.' });
        }
    } catch (error) {
        console.error('❌ Error generating attendance summary Excel:', error);
        res.status(500).json({ message: 'Failed to generate the attendance summary report.' });
    }
};

exports.generateAttendanceReportSummaryByPlaza = async (startDate, endDate, plazaName, req, res, deliveryMethod, recipientEmail) => {
    try {
        console.log(`\n🔹 [START] Generating Attendance Report`);
        console.log(`📅 Start Date: ${startDate}, End Date: ${endDate}`);
        console.log(`🏢 Plaza Name: "${plazaName}"`);
        console.log(`📤 Delivery Method: ${deliveryMethod}`);
        console.log(`📧 Recipient Email: ${recipientEmail || 'N/A'}`);

        if (!startDate || !endDate || !plazaName) {
            console.error('❌ Missing required parameters: Start date, end date, or plaza name.');
            return res.status(400).json({ message: 'Start date, end date, and plaza name are required.' });
        }

        const normalizedDeliveryMethod = (deliveryMethod || '').toLowerCase();
        if (!['download', 'email'].includes(normalizedDeliveryMethod)) {
            console.error('❌ Invalid delivery method:', deliveryMethod);
            return res.status(400).json({ message: 'Invalid delivery method. Use "download" or "email".' });
        }

        console.log(`📌 Fetching attendance records for plaza: "${plazaName}"...`);
        const attendanceRecords = await Attendance.find({
            plazaName: { $regex: new RegExp(`^${plazaName.trim()}$`, 'i') },
            date: { $gte: startDate, $lte: endDate }
        }).sort({ userId: 1 });

        if (attendanceRecords.length === 0) {
            console.warn(`⚠️ No attendance records found for the specified plaza: "${plazaName}"`);
            return res.status(404).json({ message: 'No attendance records found for the specified plaza.' });
        }

        const userIds = [...new Set(attendanceRecords.map(record => record.userId))];
        const users = await User.find({ _id: { $in: userIds } }).sort({ _id: 1 });

        const usersSummaryData = await Promise.all(users.map(async (user) => {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id, startDate, endDate);
            const regularizations = await AttendanceRegularization.find({
                user: user._id,
                startDate: { $lte: endDate },
                endDate: { $gte: startDate },
                status: 'Approved'
            }).lean();

            const totalDays = attendanceRecords.length;
            const presentDays = attendanceRecords.filter(r => r.present === 'Yes' || r.present === 'Attendance Regularized').length;
            const absentDays = totalDays - presentDays;
            const totalWorkingHours = attendanceRecords.reduce((acc, r) => {
                if (r.totalWorkingHours && r.totalWorkingHours !== 'No working hours' && r.totalWorkingHours !== 'Attendance Regularized') {
                    const [hours, minutes] = r.totalWorkingHours.split(' ').filter((_, i) => i % 2 === 0);
                    acc += parseInt(hours) + (parseInt(minutes) / 60 || 0);
                }
                return acc;
            }, 0);

            const averageWorkingHours = presentDays ? (totalWorkingHours / presentDays).toFixed(2) : 0;
            const compliance = totalDays ? ((presentDays / totalDays) * 100).toFixed(2) : 0;
            const totalRegularizations = regularizations.length;

            return {
                name: user.name,
                fatherName: user.fatherName || 'N/A',
                email: user.email,
                employeeId: user.employeeId || 'N/A',
                plazaName: plazaName.trim(),
                totalDays,
                presentDays,
                totalLeaves: totalDays - presentDays - absentDays,
                totalPaidDays: presentDays + totalRegularizations,
                absentDays,
                totalWorkingHours: totalWorkingHours.toFixed(2),
                averageWorkingHours,
                regularizations: totalRegularizations,
                compliance
            };
        }));

        console.log('✅ User summary data processed.');
        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            plazaName: plazaName.trim(),
            generatedOn: moment().format('MMMM Do, YYYY'),
            users: usersSummaryData
        };

        console.log('📌 Compiling HTML report template...');
        const htmlContent = handlebars.compile(fs.readFileSync('templates/AttendanceReportPlazaUI.html', 'utf-8'))(reportData);

        console.log('🚀 Generating PDF Report...');
        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });
        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        console.log('✅ PDF Report Generated Successfully.');

        if (normalizedDeliveryMethod === 'download') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${plazaName.trim()}.pdf`);
            return res.end(pdfBuffer);
        } else if (normalizedDeliveryMethod === 'email') {
            if (!recipientEmail) {
                recipientEmail = req.user?.email;
            }
            if (!recipientEmail) {
                console.error('❌ Recipient email is missing for email delivery.');
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }
            await sendEmailWithAttachment(recipientEmail, { buffer: pdfBuffer }, {
                subject: 'Attendance History Report Summary By Plaza Name',
                name: req.user?.name || 'User',
                message: 'Please find attached the attendance summary report for selected Plaza.',
                fileType: 'pdf'
            });
            console.log('📨 Email sent successfully!');
            return res.status(200).json({ message: 'Attendance report emailed successfully.' });
        }
    } catch (error) {
        console.error('❌ Error generating attendance report:', error);
        return res.status(500).json({ message: 'Failed to generate the report.' });
    }
};

exports.generateAttendanceReportSummaryByPlazaExcel = async (startDate, endDate, plazaName, req, res, deliveryMethod, recipientEmail) => {
    try {
        console.log(`\n🔹 [START] Generating Attendance Report (Excel)`);

        const attendanceRecords = await Attendance.find({
            plazaName: { $regex: new RegExp(`^${plazaName.trim()}$`, 'i') },
            date: { $gte: startDate, $lte: endDate }
        }).sort({ userId: 1 });

        if (attendanceRecords.length === 0) {
            console.warn(`⚠️ No attendance records found for the specified plaza: "${plazaName}"`);
            return res.status(404).json({ message: 'No attendance records found for the specified plaza.' });
        }

        const userIds = [...new Set(attendanceRecords.map(record => record.userId))];
        const users = await User.find({ _id: { $in: userIds } }).sort({ _id: 1 });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Attendance Summary');

        worksheet.columns = [
            { header: 'Name', key: 'name', width: 20 },
            { header: 'Father Name', key: 'fatherName', width: 20 },
            { header: 'Email', key: 'email', width: 25 },
            { header: 'Employee ID', key: 'employeeId', width: 15 },
            { header: 'Plaza Name', key: 'plazaName', width: 20 },
            { header: 'Total Days', key: 'totalDays', width: 12 },
            { header: 'Present Days', key: 'presentDays', width: 15 },
            { header: 'Total Leaves', key: 'totalLeaves', width: 15 },
            { header: 'Total Paid Days', key: 'totalPaidDays', width: 15 },
            { header: 'Absent Days', key: 'absentDays', width: 12 },
            { header: 'Total Working Hours', key: 'totalWorkingHours', width: 20 },
            { header: 'Average Working Hours', key: 'averageWorkingHours', width: 22 },
            { header: 'Regularizations', key: 'regularizations', width: 15 },
            { header: 'Compliance (%)', key: 'compliance', width: 15 }
        ];

        worksheet.getRow(1).eachCell(cell => {
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: '25325F' }
            };
            cell.font = { color: { argb: 'F7A832' }, bold: true };
        });

        for (const user of users) {
            const attendanceRecords = await this.getAttendanceByDateRange(user._id, startDate, endDate);
            const totalDays = attendanceRecords.length;
            const presentDays = attendanceRecords.filter(r => r.present === 'Yes' || r.present === 'Attendance Regularized').length;
            const absentDays = totalDays - presentDays;
            const totalWorkingHours = attendanceRecords.reduce((acc, r) => {
                if (r.totalWorkingHours && r.totalWorkingHours !== 'No working hours' && r.totalWorkingHours !== 'Attendance Regularized') {
                    const [hours, minutes] = r.totalWorkingHours.split(' ').filter((_, i) => i % 2 === 0);
                    acc += parseInt(hours) + (parseInt(minutes) / 60 || 0);
                }
                return acc;
            }, 0);

            worksheet.addRow({
                name: user.name,
                fatherName: user.fatherName || 'N/A',
                email: user.email,
                employeeId: user.employeeId || 'N/A',
                plazaName: plazaName.trim(),
                totalDays,
                presentDays,
                totalLeaves: totalDays - presentDays - absentDays,
                totalPaidDays: presentDays,
                absentDays,
                totalWorkingHours: totalWorkingHours.toFixed(2),
                averageWorkingHours: presentDays ? (totalWorkingHours / presentDays).toFixed(2) : 0,
                regularizations: 0,
                compliance: totalDays ? ((presentDays / totalDays) * 100).toFixed(2) : 0
            });
        }

        const buffer = await workbook.xlsx.writeBuffer();
        console.log('✅ Excel Report Generated Successfully.');

        if (deliveryMethod === 'download') {
            res.setHeader('Content-Disposition', `attachment; filename=attendance_report_${plazaName.trim()}.xlsx`);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Length', buffer.length);
            return res.end(buffer);
        } else if (deliveryMethod === 'email') {
            if (!recipientEmail) recipientEmail = req.user?.email;
            if (!recipientEmail) {
                console.error('❌ Recipient email is missing for email delivery.');
                return res.status(400).json({ message: 'Recipient email is required for emailing the report.' });
            }
            await sendEmailWithAttachment(recipientEmail, { buffer }, {
                subject: 'Attendance History Report Summary By Plaza Name (Excel)',
                name: req.user?.name || 'User',
                message: 'Please find attached the attendance summary report for selected Plaza (Excel).',
                fileType: 'xlsx'
            });
            console.log('📨 Email sent successfully!');
            return res.status(200).json({ message: 'Attendance report emailed successfully.' });
        }
    } catch (error) {
        console.error('❌ Error generating attendance report:', error);
        return res.status(500).json({ message: 'Failed to generate the report.' });
    }
};
