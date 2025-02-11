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

exports.generateUserTagsAttendanceReportPDF = async (startDate, endDate, userTagsFilter, deliveryMethod, recipientEmail) => {
    try {
        console.log(`🔹 [START] Generating attendance report`);
        console.log(`🔹 Start Date: ${startDate}, End Date: ${endDate}`);
        console.log(`🔹 UserTags Filter: ${userTagsFilter || 'N/A'}`);
        console.log(`🔹 Delivery Method: ${deliveryMethod}, Recipient Email: ${recipientEmail || 'N/A'}`);

        if (!Array.isArray(userTagsFilter) || userTagsFilter.length === 0) {
            console.warn('⚠️ No UserTags provided. Skipping user fetch.');
            return { success: false, message: 'No attendance records found' };
        }

        console.log('📌 Fetching users from the database...');
        const users = await User.find({ UserTags: { $in: userTagsFilter } });
        console.log(`✅ Total users found: ${users.length}`);

        if (users.length === 0) {
            console.warn('⚠️ No users found matching the provided UserTags.');
            return { success: false, message: 'No attendance records found' };
        }

        console.log('📌 Fetching attendance records for each user...');
        const usersData = await Promise.all(users.map(async (user) => {
            console.log(`👤 Processing User: ${user.name} (ID: ${user._id})`);

            let attendanceRecords;
            try {
                attendanceRecords = await exports.getAttendanceByDateRange(user._id.toString(), startDate, endDate);
                console.log(`✅ Attendance records fetched for ${user.name}: ${attendanceRecords.length} records found.`);
            } catch (err) {
                console.error(`❌ Error fetching attendance for ${user.name}:`, err);
                attendanceRecords = [];
            }

            console.log(`📌 Raw Attendance Data for ${user.name}:`, JSON.stringify(attendanceRecords, null, 2));

            // Ensure proper date formatting for the report
            const formattedAttendance = attendanceRecords.map(record => ({
                date: record.date,
                punchIn: record.punchIn ? moment(record.punchIn).format('YYYY-MM-DD HH:mm:ss') : 'N/A',
                punchOut: record.punchOut ? moment(record.punchOut).format('YYYY-MM-DD HH:mm:ss') : 'N/A',
                present: record.present,
                absent: record.absent,
                totalWorkingHours: record.totalWorkingHours,
                image: record.image // Base64 encoded image
            }));

            console.log(`✅ Formatted Attendance Data for ${user.name}:`, JSON.stringify(formattedAttendance, null, 2));

            return {
                name: user.name,
                email: user.email,
                phone: user.phone,
                position: user.position,
                workLocation: user.workLocation,
                UserTags: user.UserTags,
                attendance: formattedAttendance // Attach formatted attendance data
            };
        }));

        console.log('✅ Attendance records fetched successfully.');

        const templatePath = path.join(__dirname, '..', 'templates', 'AttendanceReportUI.html');
        let templateSource = fs.readFileSync(templatePath, 'utf-8');
        const template = handlebars.compile(templateSource);
        console.log('✅ Template compiled.');

        const reportData = {
            startDate: moment(startDate).format('MMMM Do, YYYY'),
            endDate: moment(endDate).format('MMMM Do, YYYY'),
            users: usersData
        };

        const htmlContent = template(reportData);
        console.log('✅ HTML content generated.');

        const browser = await puppeteer.launch();
        const page = await browser.newPage();
        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
        await browser.close();
        console.log('📄 PDF Generated.');

        if (deliveryMethod === 'email') {
            if (!recipientEmail) return { success: false, message: 'Recipient email is required.' };

            await sendEmailWithAttachment(recipientEmail, { buffer: pdfBuffer }, {
                subject: 'Attendance Report',
                name: 'User',
                message: 'Please find your attendance report attached.',
                fileType: 'pdf'
            });
            console.log('✅ Email sent successfully.');
            return { success: true, message: 'Attendance report emailed successfully.' };
        }

        return { success: true, pdfBuffer };

    } catch (error) {
        console.error('❌ Error generating report:', error);
        return { success: false, message: 'Failed to generate the report.' };
    }
};