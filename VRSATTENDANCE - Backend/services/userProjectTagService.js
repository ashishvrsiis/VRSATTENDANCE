const UserProjectTag = require('../models/UserProjectTag');
const User = require('../models/User');


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

exports.removeUserTag = async (userId, tagName, currentUser) => {
    if (!userId || !tagName) {
      throw new Error('User ID and tag name are required');
    }
  
    // Role check
    if (![1, 2, 3].includes(currentUser.role)) {
      throw new Error('Access denied');
    }
  
    if (currentUser.role === 3 && !currentUser.manager) {
      throw new Error('Only managers with permission can remove tags');
    }
  
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }
  
    const updatedTags = user.UserTags.filter((tag) => tag !== tagName);
    user.UserTags = updatedTags;
    await user.save();
  
    return updatedTags;
  };