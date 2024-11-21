// middleware/authenticateToken.js
const jwt = require('jsonwebtoken');
const User = require('../models/User'); // Ensure this path is correct

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    console.log('Authorization Header:', authHeader);
    const token = authHeader && authHeader.split(' ')[1];
    console.log('Token:', token);

    if (!token) {
        console.log('No token provided');
        return res.status(401).json({ message: 'No token provided', code: 'token_not_valid' });
    }

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) {
            console.log('Token verification failed:', err);

            // Check if the error is related to token expiration
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ message: 'Token has expired', code: 'token_not_valid' });
            }

            // Handle other token errors (invalid token, malformed, etc.)
            return res.status(403).json({ message: 'Invalid token', code: 'token_not_valid' });
        }

        // Log the decoded token
        console.log('Decoded token:', decoded);

        // Fetch user from the database and add role to req.user
        const user = await User.findById(decoded.userId);
        if (!user) {
            console.log('User not found');
            return res.status(404).json({ message: 'User not found' });
        }

        // Populate req.user with necessary fields, including 'manager'
        req.user = {
            userId: user._id,
            role: user.role,
            manager: user.manager, // Include the 'manager' field
            tokenType: decoded.tokenType
        };

        console.log('Token verified, user:', req.user);
        next();
    });
};

module.exports = authenticateToken;
