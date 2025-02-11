const UserProjectTag = require('../models/UserProjectTag');

exports.createUserProjectTag = async (name, description, userId) => {
    try {
        // Check if tag already exists
        const existingTag = await UserProjectTag.findOne({ name });
        if (existingTag) {
            throw new Error('Tag with this name already exists');
        }

        // Create new tag
        const newTag = new UserProjectTag({
            name,
            description,
            createdBy: userId,
        });

        return await newTag.save();
    } catch (error) {
        throw new Error(error.message);
    }
};
