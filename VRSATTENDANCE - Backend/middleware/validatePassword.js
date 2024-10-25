const { body, validationResult } = require('express-validator');

exports.validatePasswordChange = [
    body('action').equals('change').withMessage('Invalid action.'),
    body('email_address').isEmail().withMessage('Valid email is required.'),
    body('otp').isLength({ min: 6, max: 6 }).withMessage('OTP must be 6 digits.'),
    body('new_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters long.'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];

exports.validateForgotPassword = [
    body('action').equals('forgot').withMessage('Invalid action.'),
    body('email_address').isEmail().withMessage('Valid email is required.'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        next();
    }
];
