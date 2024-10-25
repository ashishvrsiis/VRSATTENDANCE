// middleware/leaveBalanceMiddleware.js
const { body, validationResult } = require('express-validator');

exports.validateLeaveBalanceUpdate = [
  body('leaveType').not().isEmpty().withMessage('Leave type is required'),
  body('balance').isNumeric().withMessage('Balance must be a number'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
