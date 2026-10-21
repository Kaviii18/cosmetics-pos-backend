const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { isAdmin } = require('../middleware/authMiddleware');

router.get('/', settingController.getSettings);
router.put('/', isAdmin, settingController.updateSettings);

module.exports = router;
