// models/tollModel.js
const mongoose = require('mongoose');

const tollSchema = new mongoose.Schema({
  LocationName: { type: String, required: true },
  Latitude: { type: String, required: true },
  Longitude: { type: String, required: true }
});

module.exports = mongoose.model('Toll', tollSchema);
