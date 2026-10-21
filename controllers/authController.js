const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const { getJwtSecret } = require('../middleware/authMiddleware');

// Register a new user (Cashier or Admin)
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters long.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    // Check if user already exists
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'An account with this email already exists. Please sign in.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    // Accounts created through the API are always cashiers. Admins are created with
    // `npm run create-admin` (server side) so nobody can promote themselves.
    const assignedRole = 'cashier';

    // Insert user
    const result = await db.query(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)',
      [cleanName, cleanEmail, hashedPassword, assignedRole]
    );

    const userId = result.insertId;

    // Generate JWT token
    const token = jwt.sign(
      { id: userId, name: cleanName, email: cleanEmail, role: assignedRole },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    return res.status(201).json({
      message: 'Account registered successfully! Welcome aboard.',
      token,
      user: {
        id: userId,
        name: cleanName,
        email: cleanEmail,
        role: assignedRole
      }
    });
  } catch (err) {
    console.error('Registration Error:', err);
    return res.status(500).json({ message: 'Unable to register user. Please try again.' });
  }
};

// Login existing user
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide both email and password.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const users = await db.query('SELECT * FROM users WHERE LOWER(email) = ?', [cleanEmail]);
    if (users.length === 0) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const user = users[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: '24h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (err) {
    console.error('Login Error:', err);
    return res.status(500).json({ message: 'Unable to login. Please try again.' });
  }
};

// Get current user profile
exports.getMe = async (req, res) => {
  try {
    const users = await db.query('SELECT id, name, email, role, created_at FROM users WHERE id = ?', [req.user.id]);
    if (users.length === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.json(users[0]);
  } catch (err) {
    return res.status(500).json({ message: 'Error fetching user profile.' });
  }
};
