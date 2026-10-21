const db = require('../config/db');

exports.getCustomers = async (req, res) => {
  try {
    const { search } = req.query;
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR phone LIKE ? OR email LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    sql += ' ORDER BY name ASC';

    const customers = await db.query(sql, params);
    return res.json(customers);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to fetch customers.' });
  }
};

exports.getCustomerPurchases = async (req, res) => {
  try {
    const { id } = req.params;
    const sales = await db.query('SELECT * FROM sales WHERE customer_id = ? ORDER BY created_at DESC', [id]);
    return res.json(sales);
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching customer history.' });
  }
};

exports.createCustomer = async (req, res) => {
  try {
    const { name, phone, email } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ message: 'Customer Name and Phone Number are required.' });
    }

    const existing = await db.query('SELECT id FROM customers WHERE phone = ?', [phone]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'A customer with this phone number already exists.' });
    }

    const result = await db.query(
      'INSERT INTO customers (name, phone, email, total_purchases) VALUES (?, ?, ?, 0.00)',
      [name, phone, email || '']
    );

    const newCust = await db.query('SELECT * FROM customers WHERE id = ?', [result.insertId]);
    return res.status(201).json({ message: 'Customer added successfully', customer: newCust[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to add customer.' });
  }
};

exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email } = req.body;

    await db.query('UPDATE customers SET name = ?, phone = ?, email = ? WHERE id = ?', [name, phone, email, id]);
    const updated = await db.query('SELECT * FROM customers WHERE id = ?', [id]);
    return res.json({ message: 'Customer updated successfully', customer: updated[0] });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to update customer.' });
  }
};

exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    await db.query('DELETE FROM customers WHERE id = ?', [id]);
    return res.json({ message: 'Customer deleted successfully.' });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to delete customer.' });
  }
};
