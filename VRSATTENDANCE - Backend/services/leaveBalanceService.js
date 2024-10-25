// services/leaveBalanceService.js
const LeaveBalance = require('../models/LeaveBalance');
const Leave = require('../models/leaveModel');
const mongoose = require('mongoose');
const ObjectId = mongoose.Types.ObjectId;

exports.getLeaveBalance = async (userId) => {
    try {
        console.log('Received userId:', userId);
        
        // Ensure userId is an ObjectId type if it's a string
        let userObjectId;
        try {
            if (typeof userId === 'string') {
                userObjectId = new mongoose.Types.ObjectId(userId); // Convert string to ObjectId
            } else {
                userObjectId = userId; // Assume userId is already an ObjectId
            }
            console.log('Converted userId to ObjectId:', userObjectId);
        } catch (conversionError) {
            console.error('Error converting userId to ObjectId:', conversionError);
            throw new Error('Invalid userId format');
        }

        const leaveBalances = await LeaveBalance.find({ user: userObjectId }).populate('user', 'name');
        console.log('Fetched leave balances:', leaveBalances);
        
        const consumedLeaves = await Leave.aggregate([
            { $match: { employeeId: userObjectId, status: 'Approved' } },
            {
                $project: {
                    leaveType: 1,
                    duration: {
                        $subtract: [
                            { $dateDiff: { startDate: '$startDate', endDate: '$endDate', unit: 'day' } },
                            1
                        ]
                    }
                }
            },
            { $group: { _id: { leaveType: '$leaveType' }, totalConsumed: { $sum: '$duration' } } }
        ]);
        console.log('Aggregated consumed leaves:', consumedLeaves);

        leaveBalances.forEach(balance => {
            const consumed = consumedLeaves.find(c => c._id.leaveType === balance.leaveType);
            balance.consumedLeaves = consumed ? consumed.totalConsumed : 0;
            balance.availableLeaves = balance.totalLeaves - balance.consumedLeaves;
        });

        return leaveBalances;
    } catch (error) {
        console.error('Error in getLeaveBalance service:', error);
        throw new Error('Error fetching leave balance');
    }
};

  exports.updateLeaveBalance = async (userId, leaveType, newBalance) => {
    // Ensure newBalance is treated as a number
    const balance = Number(newBalance);
  
    // Log the balance conversion
    console.log('Converting balance to number:', balance);
  
    if (isNaN(balance)) {
      console.error('Error: Balance must be a number');
      throw new Error('Balance must be a number');
    }
  
    // Log before querying the database
    console.log('Finding leave balance for user:', userId, 'and leave type:', leaveType);
  
    const leaveBalance = await LeaveBalance.findOne({ user: userId, leaveType });
  
    if (leaveBalance) {
      // Log existing leave balance
      console.log('Existing leave balance found:', leaveBalance);
  
      leaveBalance.totalLeaves = balance;
      leaveBalance.availableLeaves = balance - leaveBalance.consumedLeaves; // Update available leaves
  
      // Log balance update
      console.log('Updating leave balance:', leaveBalance);
  
      return leaveBalance.save();
    } else {
      // Log creation of new leave balance
      console.log('No existing balance found. Creating new leave balance.');
  
      return LeaveBalance.create({
        user: userId,
        leaveType,
        totalLeaves: balance,
        consumedLeaves: 0, // Initialize to 0
        availableLeaves: balance
      });
    }
  };