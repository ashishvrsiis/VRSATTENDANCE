// controllers/tollController.js
const tollService = require('../services/tollService');
const Toll = require('../models/tollModel');

const getTollPlazas = async (page, limit) => {
  try {
    const numericPage = parseInt(page);
    const numericLimit = parseInt(limit);

    const isPaginated =
      !isNaN(numericPage) && !isNaN(numericLimit) && numericPage > 0 && numericLimit > 0;

    if (isPaginated) {
      const skip = (numericPage - 1) * numericLimit;
      const tollPlazas = await Toll.find().skip(skip).limit(numericLimit);
      const total = await Toll.countDocuments();

      return {
        data: tollPlazas,
        total,
        page: numericPage,
        totalPages: Math.ceil(total / numericLimit),
      };
    } else {
      const tollPlazas = await Toll.find();
      const total = tollPlazas.length;

      return {
        data: tollPlazas,
        total,
        page: 1,
        totalPages: 1,
      };
    }
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
