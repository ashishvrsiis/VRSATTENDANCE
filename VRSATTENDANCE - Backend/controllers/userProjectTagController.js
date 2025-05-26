const userProjectTagService = require('../services/userProjectTagService');
const UserProjectTag = require('../models/UserProjectTag');

exports.createTag = async (req, res) => {
    try {
        const { name, description } = req.body;

        if (!name) {
            return res.status(400).json({ message: 'Tag name is required' });
        }

        // Create tag using service
        const newTag = await userProjectTagService.createUserProjectTag(name, description, req.user.userId);

        res.status(201).json({ message: 'User Project Tag created successfully', tag: newTag });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.getAllTagNames = async (req, res) => {
    try {
        // Fetch all tag names from the database
        const tags = await UserProjectTag.find({}, 'name'); // Only fetches 'name' field

        if (!tags.length) {
            return res.status(404).json({ message: 'No tags found' });
        }

        res.status(200).json({ message: 'Tags retrieved successfully', tags });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

exports.removeUserTag = async (req, res) => {
    try {
      const { userId, tagName } = req.body;
      const currentUser = req.user;
  
      const updatedTags = await userProjectTagService.removeUserTag(userId, tagName, currentUser);
  
      return res.status(200).json({
        message: 'Tag removed successfully',
        tags: updatedTags,
      });
    } catch (error) {
      console.error('Error removing tag:', error.message);
      return res.status(400).json({ message: error.message });
    }
  };
