// services/tollService.js
const Toll = require('../models/tollModel');

class TollService {
  async getTollPlazas() {
    return await Toll.find();
  }

  async addTollPlaza(data) {
    const toll = new Toll(data);
    return await toll.save();
  }

  async deleteTollPlaza(id) {
    return await Toll.findByIdAndDelete(id);
  }
}

module.exports = new TollService();
