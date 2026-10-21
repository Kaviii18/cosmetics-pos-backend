const db = require('../config/db');

// Get all products with search, filter, and sorting
exports.getProducts = async (req, res) => {
  try {
    const { search, category, brand, status, sort } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR brand LIKE ? OR sku LIKE ? OR barcode LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (category && category !== 'All') {
      sql += ' AND category_name = ?';
      params.push(category);
    }

    if (brand) {
      sql += ' AND brand = ?';
      params.push(brand);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    if (sort === 'price_asc') {
      sql += ' ORDER BY selling_price ASC';
    } else if (sort === 'price_desc') {
      sql += ' ORDER BY selling_price DESC';
    } else if (sort === 'stock_low') {
      sql += ' ORDER BY current_stock ASC';
    } else {
      sql += ' ORDER BY id DESC';
    }

    // NOTE: this endpoint is intentionally NOT paginated and has no LIMIT: it returns every
    // matching product. The total is also sent in a header so offline-capable clients can
    // verify they received the complete catalog before replacing their local copy.
    const products = await db.query(sql, params);
    res.set('X-Total-Count', String(products.length));
    res.set('Cache-Control', 'no-store');
    return res.json(products);
  } catch (err) {
    console.error('Get Products Error:', err);
    return res.status(500).json({ message: 'Unable to fetch products.' });
  }
};

// Get single product by barcode or SKU or ID
exports.getProductByBarcode = async (req, res) => {
  try {
    const { barcode } = req.params;
    const products = await db.query(
      'SELECT * FROM products WHERE barcode = ? OR sku = ? OR id = ?',
      [barcode, barcode, barcode]
    );

    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    return res.json(products[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching product details.' });
  }
};

// Create Product
exports.createProduct = async (req, res) => {
  try {
    const {
      name, brand, category_id, category_name, description, sku, barcode,
      buying_price, selling_price, current_stock, minimum_stock, image_url, expiry_date
    } = req.body;

    if (!name || !sku || !barcode || selling_price === undefined) {
      return res.status(400).json({ message: 'Product Name, SKU, Barcode, and Selling Price are required.' });
    }

    // Check SKU or Barcode duplicate
    const existing = await db.query('SELECT id FROM products WHERE sku = ? OR barcode = ?', [sku, barcode]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'A product with this SKU or Barcode already exists.' });
    }

    const stockVal = parseInt(current_stock || 0);
    const minVal = parseInt(minimum_stock || 5);
    let status = 'in_stock';
    if (stockVal === 0) status = 'out_of_stock';
    else if (stockVal <= minVal) status = 'low_stock';

    const result = await db.query(`
      INSERT INTO products (name, brand, category_id, category_name, description, sku, barcode, buying_price, selling_price, current_stock, minimum_stock, image_url, expiry_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, brand || 'Generic', category_id || null, category_name || 'Other',
      description || '', sku, barcode, parseFloat(buying_price || 0), parseFloat(selling_price),
      stockVal, minVal, image_url || '', expiry_date || null, status
    ]);

    const newId = result.insertId;
    const newProducts = await db.query('SELECT * FROM products WHERE id = ?', [newId]);
    return res.status(201).json({ message: 'Product created successfully', product: newProducts[0] });
  } catch (err) {
    console.error('Create Product Error:', err);
    return res.status(500).json({ message: 'Unable to save product. Please try again.' });
  }
};

// Update Product
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name, brand, category_id, category_name, description, sku, barcode,
      buying_price, selling_price, current_stock, minimum_stock, image_url, expiry_date
    } = req.body;

    const stockVal = parseInt(current_stock || 0);
    const minVal = parseInt(minimum_stock || 5);
    let status = 'in_stock';
    if (stockVal === 0) status = 'out_of_stock';
    else if (stockVal <= minVal) status = 'low_stock';

    await db.query(`
      UPDATE products SET
        name = ?, brand = ?, category_id = ?, category_name = ?, description = ?,
        sku = ?, barcode = ?, buying_price = ?, selling_price = ?, current_stock = ?,
        minimum_stock = ?, image_url = ?, expiry_date = ?, status = ?
      WHERE id = ?
    `, [
      name, brand || 'Generic', category_id || null, category_name || 'Other', description || '',
      sku, barcode, parseFloat(buying_price || 0), parseFloat(selling_price || 0),
      stockVal, minVal, image_url || '', expiry_date || null, status, id
    ]);

    const updated = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    return res.json({ message: 'Product updated successfully', product: updated[0] });
  } catch (err) {
    console.error('Update Product Error:', err);
    return res.status(500).json({ message: 'Unable to update product.' });
  }
};

// Delete Product
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM products WHERE id = ?', [id]);
    return res.json({ message: 'Product deleted successfully.' });
  } catch (err) {
    console.error('Delete Product Error:', err);
    return res.status(500).json({ message: 'Unable to delete product.' });
  }
};
