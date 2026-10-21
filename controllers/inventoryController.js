const db = require('../config/db');

exports.getInventory = async (req, res) => {
  try {
    const { search, status } = req.query;
    let sql = 'SELECT id, name, brand, sku, barcode, current_stock, minimum_stock, status, category_name FROM products WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR sku LIKE ? OR barcode LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    sql += ' ORDER BY current_stock ASC';
    const inventory = await db.query(sql, params);
    return res.json(inventory);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to fetch inventory.' });
  }
};

exports.adjustStock = async (req, res) => {
  try {
    const { product_id, type, quantity_changed, note } = req.body;
    if (!product_id || !type || quantity_changed === undefined) {
      return res.status(400).json({ message: 'Product, Adjustment Type, and Quantity are required.' });
    }

    const products = await db.query('SELECT * FROM products WHERE id = ?', [product_id]);
    if (products.length === 0) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    const prod = products[0];
    const prevStock = parseInt(prod.current_stock);
    const change = parseInt(quantity_changed);
    const newStock = Math.max(0, prevStock + change);

    let newStatus = 'in_stock';
    if (newStock === 0) newStatus = 'out_of_stock';
    else if (newStock <= prod.minimum_stock) newStatus = 'low_stock';

    // Update Product Stock
    await db.query(
      'UPDATE products SET current_stock = ?, status = ? WHERE id = ?',
      [newStock, newStatus, product_id]
    );

    // Record Inventory Transaction
    const userName = req.user ? req.user.name : 'System Admin';
    await db.query(`
      INSERT INTO inventory_transactions (product_id, product_name, type, quantity_changed, previous_stock, new_stock, note, user_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [product_id, prod.name, type, change, prevStock, newStock, note || '', userName]);

    return res.json({
      message: 'Stock adjusted successfully',
      new_stock: newStock,
      status: newStatus
    });
  } catch (err) {
    console.error('Adjust Stock Error:', err);
    return res.status(500).json({ message: 'Unable to adjust stock.' });
  }
};

exports.getInventoryHistory = async (req, res) => {
  try {
    const history = await db.query('SELECT * FROM inventory_transactions ORDER BY created_at DESC LIMIT 100');
    return res.json(history);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to fetch stock history.' });
  }
};
