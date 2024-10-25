// services/locationService.js
const Location = require('../models/Location');

// Create a new location if locationName doesn't already exist
const createLocation = async (locationData) => {
    const existingLocation = await Location.findOne({ locationName: locationData.locationName });
    if (existingLocation) {
        throw new Error('Location with this name already exists');
    }
    const location = new Location(locationData);
    return await location.save();
};

// Update location by locationName
const updateLocation = async (locationName, updateData) => {
    const location = await Location.findOneAndUpdate(
        { locationName: locationName },
        updateData,
        { new: true }  // Return the updated document
    );
    if (!location) {
        throw new Error('Location not found');
    }
    return location;
};

// Get all locations
const getLocations = async () => {
    return await Location.find();
};

module.exports = {
    createLocation,
    updateLocation,
    getLocations,
};