// attendanceRegularizationMiddleware.js
const { body, validationResult } = require('express-validator');

exports.validateAttendance = [
  body('approverName').not().isEmpty().withMessage('Approver name is required'),
  body('startDate').isDate().withMessage('Start date is required'),
  body('endDate').isDate().withMessage('End date is required'),
  body('regularizationType').not().isEmpty().withMessage('Regularization type is required'),
  body('reason').optional().isString().withMessage('Reason must be a string'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  },
];
