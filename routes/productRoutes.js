const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { isAdmin } = require('../middleware/authMiddleware');

router.get('/', productController.getProducts);
router.get('/barcode/:barcode', productController.getProductByBarcode);
router.post('/', productController.createProduct);
router.put('/:id', productController.updateProduct);
router.delete('/:id', isAdmin, productController.deleteProduct);

module.exports = router;
