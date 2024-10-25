// services/policyService.js
const Policy = require('../models/Policy');

exports.getPolicy = async (type) => {
    try {
        const policy = await Policy.findOne({ type });
        if (!policy) {
            throw new Error(`${type.charAt(0).toUpperCase() + type.slice(1)} policy not found`);
        }
        return policy;
    } catch (error) {
        throw new Error('Error fetching policy: ' + error.message);
    }
};

exports.updatePolicy = async (type, title, content) => {
    try {
        const policy = await Policy.findOneAndUpdate(
            { type },
            { title, content, lastUpdated: Date.now() },
            { new: true, upsert: true } // Create if not exists
        );
        return policy;
    } catch (error) {
        throw new Error('Error updating policy: ' + error.message);
    }
};
