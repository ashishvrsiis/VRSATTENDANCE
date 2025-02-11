const authorizeAdmin = (req, res, next) => {
    if (!req.user || (req.user.role !== 1 && req.user.role !== 2)) {
        console.log('Access denied. User is not an admin.');
        return res.status(403).json({ message: 'Forbidden: Only admins can perform this action' });
    }
    next();
};

module.exports = authorizeAdmin;
