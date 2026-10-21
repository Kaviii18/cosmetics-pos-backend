/**
 * Creates (or resets the password of) a user - by default the first admin. Run once after `npm run migrate`.
 *
 *   ADMIN_NAME="Shop Owner" ADMIN_EMAIL=owner@example.com ADMIN_PASSWORD='a-long-password' npm run create-admin
 *
 * The password is read from the environment, hashed with bcrypt, and never printed or stored in code.
 * If the email already exists the script does nothing unless RESET_PASSWORD=true is also set.
 */
const bcrypt = require('bcryptjs');
const db = require('../config/db');

(async () => {
  const name = (process.env.ADMIN_NAME || 'Admin').trim();
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  const role = process.env.USER_ROLE === 'cashier' ? 'cashier' : 'admin'; // set USER_ROLE=cashier for staff accounts

  if (!email || !password) {
    console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD environment variables first.');
    process.exit(1);
  }
  if (password.length < 10) {
    console.error('ADMIN_PASSWORD must be at least 10 characters.');
    process.exit(1);
  }

  try {
    await db.initDb();
    const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = ?', [email]);
    const hash = await bcrypt.hash(password, 10);
    if (existing.length > 0) {
      if (process.env.RESET_PASSWORD === 'true') {
        await db.query('UPDATE users SET password = ?, role = ? WHERE id = ?', [hash, role, existing[0].id]);
        console.log(`Password reset for ${email}.`);
      } else {
        console.log(`User ${email} already exists. Nothing changed (set RESET_PASSWORD=true to reset).`);
      }
    } else {
      await db.query('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', [name, email, hash, role]);
      console.log(`${role} user ${email} created.`);
    }
    await db.close();
  } catch (err) {
    console.error('create-admin failed:', err.message);
    process.exit(1);
  }
})();
