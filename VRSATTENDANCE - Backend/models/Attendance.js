const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  date: { type: String, required: true },
  punchIn: { type: Date, default: null },
  punchOut: { type: Date, default: null },
  plazaName: { type: String, default: null },
  lastPlazaName: { type: String },
  latitude: { type: String, default: '' },
  longitude: { type: String, default: '' },
  image: { type: String, default: '' },
  isOffline: { type: Boolean, default: false },
  syncedTime: { type: Date },
}, { timestamps: true });

const Attendance = mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

module.exports = Attendance;
