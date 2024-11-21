// generateToken.js
const jwt = require('jsonwebtoken');

const generateAccessToken = (user) => {
    return jwt.sign({ userId: user._id, role: user.role, tokenType: 'access' }, process.env.JWT_SECRET, { expiresIn: '2h' });
};

const generateRefreshToken = (user) => {
    return jwt.sign({ userId: user._id, role: user.role, tokenType: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '30d' });
};

module.exports = {
    generateAccessToken,
    generateRefreshToken,
};
