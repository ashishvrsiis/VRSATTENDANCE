// controllers/tollController.js
const tollService = require('../services/tollService');
const Toll = require('../models/tollModel');

const getTollPlazas = async () => {
  try {
      const tollPlazas = await Toll.find({});
      return tollPlazas;
  } catch (error) {
      throw new Error("Error fetching toll plazas: " + error.message);
  }
};

// Add a new toll plaza
const addTollPlaza = async (tollData) => {
  try {
      const tollPlaza = new Toll(tollData);
      await tollPlaza.save();
      return tollPlaza;
  } catch (error) {
      throw new Error("Error adding toll plaza: " + error.message);
  }
};

// Delete a toll plaza by ID
const deleteTollPlaza = async (id) => {
  try {
      const result = await Toll.findByIdAndDelete(id);
      if (!result) {
          throw new Error('Toll plaza not found');
      }
      return result;
  } catch (error) {
      throw new Error("Error deleting toll plaza: " + error.message);
  }
};

module.exports = {
  getTollPlazas,
  addTollPlaza,
  deleteTollPlaza, // Export the delete function
};
