// middleware/authorizeRole.js
const authorizeRole = (requiredRole) => {
    return (req, res, next) => {
        const userRole = req.user.role; // Assuming role is part of the token payload
        if (userRole !== requiredRole) {
            return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
        }
        next();
    };
};

module.exports = authorizeRole;
