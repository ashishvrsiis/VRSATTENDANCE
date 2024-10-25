const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { generateAccessToken } = require('../utils/generateToken');

const verifyToken = (token) => {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        return decoded;
    } catch (error) {
        throw new Error('Invalid token');
    }
};

const refreshAccessToken = async (refreshToken) => {
    const decoded = verifyToken(refreshToken);
    if (decoded.tokenType !== 'refresh') {
        throw new Error('Invalid token type');
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
        throw new Error('User not found');
    }

    const newAccessToken = generateAccessToken(user._id);
    return { access: newAccessToken };
};

module.exports = { verifyToken, refreshAccessToken };
