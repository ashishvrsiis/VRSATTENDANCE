// controllers/leaveBalanceController.js
const leaveBalanceService = require('../services/leaveBalanceService');

exports.getLeaveBalance = async (req, res) => {
    try {
        const userId = req.user.userId; // Make sure req.user.userId is populated
        if (!userId) {
            return res.status(400).json({ error: 'User ID is missing' });
        }

        const leaveBalances = await leaveBalanceService.getLeaveBalance(userId);
        res.status(200).json(leaveBalances);
    } catch (error) {
        console.error('Error fetching leave balance:', error);
        res.status(500).json({ error: 'Error fetching leave balance' });
    }
};

  exports.updateLeaveBalance = async (req, res) => {
    try {
      const userId = req.user.userId; // Ensure this matches what is set in req.user
      const { leaveType, balance } = req.body;
  
      console.log('Received request to update leave balance:');
      console.log('User ID:', userId);
      console.log('Leave Type:', leaveType);
      console.log('Balance received:', balance);
  
      if (typeof balance !== 'number' || isNaN(balance)) {
        console.error('Invalid balance format. Must be a number.');
        return res.status(400).json({
          errors: [{
            type: 'field',
            msg: 'Balance must be a number',
            path: 'balance',
            location: 'body'
          }]
        });
      }
  
      console.log('Parsed balance:', balance);
  
      const updatedBalance = await leaveBalanceService.updateLeaveBalance(userId, leaveType, balance);
  
      console.log('Updated leave balance:', updatedBalance);
  
      res.status(200).json(updatedBalance);
    } catch (error) {
      console.error('Error updating leave balance:', error);
      res.status(500).json({ error: 'Error updating leave balance' });
    }
  };