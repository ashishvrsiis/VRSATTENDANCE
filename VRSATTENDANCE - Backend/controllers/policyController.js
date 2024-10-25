const policyService = require('../services/policyService');

exports.getPolicy = async (req, res) => {
    try {
        const { type } = req.params;
        const policy = await policyService.getPolicy(type);

        // Format the response to include all necessary fields
        res.json({
            _id: policy._id,
            type: policy.type,
            __v: policy.__v,
            lastUpdated: policy.lastUpdated,
            title: policy.title,
            Body: policy.content, // Using 'Body' with a capital 'B'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.updatePolicy = async (req, res) => {
    try {
        const { type } = req.params;
        const { title, content } = req.body; // Extract title and content from the request body
        const updatedPolicy = await policyService.updatePolicy(type, title, content);
        
        // Format the response
        res.json({
            title: updatedPolicy.title,
            Body: updatedPolicy.content, // Use 'Body' with a capital 'B'
            lastUpdated: updatedPolicy.lastUpdated, // Optionally include last updated time
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
