const Holiday = require('../models/holidayModel');

class HolidayService {
    async createHoliday(holidayData) {
        try {
            const newHoliday = new Holiday(holidayData);
            return await newHoliday.save();
        } catch (error) {
            throw new Error('Error creating holiday');
        }
    }

    async getAllHolidays() {
        try {
            return await Holiday.find();
        } catch (error) {
            throw new Error('Error fetching holidays');
        }
    }
}

module.exports = new HolidayService();
