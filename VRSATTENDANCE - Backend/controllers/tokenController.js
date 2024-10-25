const tokenService = require('../services/tokenService');

const verifyToken = (req, res) => {
    try {
        const { token } = req.body;
        tokenService.verifyToken(token);
        res.status(200).json({});
    } catch (error) {
        res.status(401).json({ message: error.message });
    }
};

const refreshToken = async (req, res) => {
    try {
        const { refresh } = req.body;
        const response = await tokenService.refreshAccessToken(refresh);
        res.status(200).json(response);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

module.exports = { verifyToken, refreshToken };
