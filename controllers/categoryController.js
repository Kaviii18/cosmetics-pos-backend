const db = require('../config/db');

exports.getCategories = async (req, res) => {
  try {
    const categories = await db.query('SELECT * FROM categories ORDER BY name ASC');
    return res.json(categories);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to fetch categories.' });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name, icon } = req.body;
    if (!name) return res.status(400).json({ message: 'Category name is required.' });

    await db.query('INSERT INTO categories (name, icon) VALUES (?, ?)', [name, icon || 'Tag']);
    return res.status(201).json({ message: 'Category created successfully.' });
  } catch (err) {
    return res.status(500).json({ message: 'Unable to create category.' });
  }
};
