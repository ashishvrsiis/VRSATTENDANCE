// routes/tollRoutes.js

const express = require('express');
const tollController = require('../controllers/tollController');
const authenticateToken = require('../middleware/authenticateToken');

const router = express.Router();

router.get('/toll-plazas', authenticateToken, async (req, res) => {
    try {
        const tollPlazas = await tollController.getTollPlazas();
        res.status(200).json(tollPlazas);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

router.post('/toll-plazas', authenticateToken, async (req, res) => {
    try {
        if (![1, 2].includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
        }

        const newTollPlaza = await tollController.addTollPlaza(req.body);
        res.status(201).json(newTollPlaza);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// DELETE route for toll plaza
router.delete('/toll-plazas/:id', authenticateToken, async (req, res) => {
    try {
        if (![1, 2].includes(req.user.role)) {
            return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
        }

        const deletedTollPlaza = await tollController.deleteTollPlaza(req.params.id);
        res.status(200).json({ message: 'Toll plaza deleted successfully', deletedTollPlaza });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
