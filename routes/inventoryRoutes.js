const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

router.get('/', inventoryController.getInventory);
router.post('/adjust', inventoryController.adjustStock);
router.get('/history', inventoryController.getInventoryHistory);

module.exports = router;
