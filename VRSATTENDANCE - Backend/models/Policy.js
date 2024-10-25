const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    type: { // Either 'privacy' or 'terms'
        type: String,
        enum: ['privacy', 'terms'],
        required: true
    },
    title: {
        type: String,
        required: true
    },
    content: {
        type: String,
        required: true
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

const Policy = mongoose.models.Policy || mongoose.model('Policy', policySchema);

module.exports = Policy;
