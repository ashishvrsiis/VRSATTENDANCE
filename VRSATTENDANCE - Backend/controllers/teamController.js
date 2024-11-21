const teamService = require('../services/teamService');

const fetchTeamHierarchy = async (req, res) => {
    try {
        const teamHierarchy = await teamService.getTeamHierarchy();
        res.status(200).json({
            success: true,
            data: teamHierarchy,
        });
    } catch (error) {
        console.error('Error fetching team hierarchy:', error.message);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch team hierarchy',
        });
    }
};

module.exports = {
    fetchTeamHierarchy, // Ensure correct export
};