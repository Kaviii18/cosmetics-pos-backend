const express = require('express');
const router = express.Router();
const couponController = require('../controllers/couponController');
const { isAdmin } = require('../middleware/authMiddleware');

router.get('/', couponController.getCoupons);
router.post('/validate', couponController.validateCoupon);
router.post('/', isAdmin, couponController.createCoupon);
router.delete('/:id', isAdmin, couponController.deleteCoupon);

module.exports = router;
