// controllers/locationController.js
const locationService = require('../services/locationService');

// Create a new location
const createLocation = async (req, res) => {
    try {
        const { locationName, latitude, longitude, additionalInfo } = req.body;
        const locationData = { locationName, latitude, longitude, additionalInfo };

        const newLocation = await locationService.createLocation(locationData);
        return res.status(201).json({ message: 'Location created successfully', data: newLocation });
    } catch (error) {
        if (error.message === 'Location with this name already exists') {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: 'Error creating location', error: error.message });
    }
};

// Update an existing location by locationName
const updateLocation = async (req, res) => {
    try {
        const { locationName } = req.params;
        const updateData = req.body;

        const updatedLocation = await locationService.updateLocation(locationName, updateData);
        return res.status(200).json({ message: 'Location updated successfully', data: updatedLocation });
    } catch (error) {
        if (error.message === 'Location not found') {
            return res.status(404).json({ message: 'Location not found' });
        }
        return res.status(500).json({ message: 'Error updating location', error: error.message });
    }
};

// Get all locations
const getLocations = async (req, res) => {
    try {
        const locations = await locationService.getLocations();
        return res.status(200).json({ data: locations });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching locations', error: error.message });
    }
};

module.exports = {
    createLocation,
    updateLocation,
    getLocations,
};
