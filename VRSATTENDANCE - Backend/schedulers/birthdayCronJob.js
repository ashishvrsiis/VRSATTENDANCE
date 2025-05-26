const cron = require('node-cron');
const moment = require('moment-timezone');
const User = require('../models/User');
const notificationService = require('../services/notificationService');
const deliveryService = require('../services/notificationDeliveryService');
const mongoose = require('mongoose');

cron.schedule('50 17 * * *', async () => {
    console.log('Running birthday notification cron job (IST 7:57PM)...');
    
    await sendBirthdayNotifications();
}, {
    timezone: "Asia/Kolkata"
});

// Separate clean function
async function sendBirthdayNotifications() {
    try {
        const now = moment().tz('Asia/Kolkata');
        console.log("Current time (IST):", now.format('YYYY-MM-DD HH:mm:ss')); // Log the current time

        const todayMonth = now.month() + 1; // month() is 0-indexed
        const todayDate = now.date();

        const users = await User.find({
            dateOfBirth: { $ne: null },
            isBlocked: false
        });

        console.log(`${users.length} users found for birthday checks.`); // Log number of users

        const notificationDocs = [];
        const deliveryDocs = [];

        for (const user of users) {
            const dob = moment(user.dateOfBirth).tz('Asia/Kolkata');
            const dobMonth = dob.month() + 1;
            const dobDate = dob.date();

            if (dobMonth === todayMonth && dobDate === todayDate) {
                const title = '🎉 Happy Birthday!';
                const message = `Dear ${user.name}, wishing you a fantastic birthday filled with joy and success! 🎂`;

                // Check if the notification already exists for today
                const startOfDayIST = now.clone().startOf('day');
                const endOfDayIST = now.clone().endOf('day');

                const existingNotification = await notificationService.findNotification({
                    userId: new mongoose.Types.ObjectId(user._id),
                    title: title,
                    createdAt: { $gte: startOfDayIST.toDate(), $lte: endOfDayIST.toDate() }
                });

                if (existingNotification) {
                    console.log(`Birthday notification already sent today for: ${user.name}`);
                    continue;
                }

                console.log(`Sending birthday notification to: ${user.name}`);

                notificationDocs.push({
                    userId: user._id,
                    title,
                    message,
                    status: 'sent',
                    createdAt: now.toDate()
                });
            }
        }

        if (notificationDocs.length > 0) {
            const insertedNotifications = await notificationService.createNotificationsBulk(notificationDocs);

            insertedNotifications.forEach(notification => {
                deliveryDocs.push({
                    notificationId: notification._id,
                    deliveryStatus: 'delivered',
                    deliveredAt: now.toDate()
                });
            });

            await deliveryService.createDeliveriesBulk(deliveryDocs);

            console.log(`✅ Sent ${insertedNotifications.length} birthday notifications to active users.`);
        } else {
            console.log('ℹ️ No birthday notifications to send today for active users.');
        }

        console.log('Birthday cron job completed.');
    } catch (error) {
        console.error('❌ Error running birthday cron job:', error);
    }
}
