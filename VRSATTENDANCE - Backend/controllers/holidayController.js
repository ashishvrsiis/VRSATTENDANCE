const holidayService = require('../services/holidayService');

class HolidayController {
    async createHoliday(req, res) {
        try {
            // Role-based authorization: only allow roles 1 and 2
            if (req.user.role !== 1 && req.user.role !== 2) {
                return res.status(403).json({ message: 'Access denied. Insufficient permissions.' });
            }

            const holidayData = req.body;
            const holiday = await holidayService.createHoliday(holidayData);
            return res.status(201).json(holiday);
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }

    async getHolidays(req, res) {
        try {
            const holidays = await holidayService.getAllHolidays();
            return res.status(200).json(holidays);
        } catch (error) {
            return res.status(500).json({ message: error.message });
        }
    }
}

module.exports = new HolidayController();
