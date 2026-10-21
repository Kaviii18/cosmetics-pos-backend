const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { isAdmin } = require('../middleware/authMiddleware');

router.get('/', customerController.getCustomers);
router.get('/:id/purchases', customerController.getCustomerPurchases);
router.post('/', customerController.createCustomer);
router.put('/:id', customerController.updateCustomer);
router.delete('/:id', isAdmin, customerController.deleteCustomer);

module.exports = router;
