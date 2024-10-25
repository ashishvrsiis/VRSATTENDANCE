const validateNotificationData = (req, res, next) => {
    const { userId, title, message } = req.body;
    if (!userId || !title || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    next();
};

module.exports = validateNotificationData;
