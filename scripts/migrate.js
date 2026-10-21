/**
 * Creates / upgrades the MySQL tables. Safe to run repeatedly: it only CREATEs missing tables
 * and ADDs missing columns. It never drops, truncates or overwrites data.
 *
 *   npm run migrate
 */
const fs = require('fs');
const path = require('path');
const db = require('../config/db');

// Columns that older databases (created before this deployment prep) may lack.
const EXTRA_COLUMNS = [
  ['sales', 'coupon_code', "VARCHAR(50) DEFAULT ''"],
  ['settings', 'cashier_name', "VARCHAR(100) DEFAULT 'Cashier'"],
  ['settings', 'logo_url', 'MEDIUMTEXT'],
  ['settings', 'printer_bridge_url', "VARCHAR(255) DEFAULT 'http://localhost:9100'"],
  ['settings', 'printer_auto_print', 'TINYINT DEFAULT 1'],
  ['settings', 'printer_model', "VARCHAR(100) DEFAULT 'YHD-5808L'"]
];

async function migrate() {
  if (db.getDbType() !== 'mysql') throw new Error('migrate.js only works with MySQL.');

  const schema = fs.readFileSync(path.join(__dirname, '..', 'config', 'schema.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  const statements = schema.split(';').map((s) => s.trim()).filter(Boolean);
  for (const stmt of statements) await db.query(stmt);

  for (const [table, column, ddl] of EXTRA_COLUMNS) {
    const rows = await db.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (!rows[0].c) {
      await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${ddl}`);
      console.log(`  added column ${table}.${column}`);
    }
  }
  console.log('Database schema is up to date.');
}

module.exports = { migrate };

if (require.main === module) {
  (async () => {
    try {
      await db.initDb();
      await migrate();
      await db.close();
    } catch (err) {
      console.error('Migration failed:', err.message);
      process.exit(1);
    }
  })();
}
