/**
 * One-time, NON-DESTRUCTIVE copy of the existing local SQLite data into the MySQL database.
 *
 *   SQLITE_PATH=./cosmetics_pos.sqlite npm run import-sqlite
 *
 * Rules:
 *  - Only copies into a table that is currently EMPTY in MySQL; a table that already has rows is skipped.
 *  - Original ids are preserved so sales <-> sale_items <-> customers <-> products relations stay intact.
 *  - The `users` table is skipped by default because the local file only contains the demo accounts
 *    (admin123 / cashier123). Use `create-admin` instead. Add IMPORT_USERS=true to copy them anyway.
 *  - The SQLite file is opened read-only and is never modified.
 */
const path = require('path');
const sqlite3 = require('sqlite3');
const db = require('../config/db');

const TABLES = ['categories', 'products', 'customers', 'sales', 'sale_items', 'inventory_transactions', 'settings', 'coupons'];
if (process.env.IMPORT_USERS === 'true') TABLES.unshift('users');

const sqlitePath = path.resolve(process.env.SQLITE_PATH || path.join(__dirname, '..', 'cosmetics_pos.sqlite'));

function sqliteAll(conn, sql) {
  return new Promise((resolve, reject) => conn.all(sql, [], (e, rows) => (e ? reject(e) : resolve(rows))));
}

(async () => {
  try {
    await db.initDb();
    if (db.getDbType() !== 'mysql') throw new Error('MySQL is not connected.');
    const src = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);

    for (const table of TABLES) {
      let rows;
      try { rows = await sqliteAll(src, `SELECT * FROM ${table}`); } catch (e) { console.log(`- ${table}: not in SQLite file, skipped`); continue; }
      const [{ c }] = await db.query(`SELECT COUNT(*) AS c FROM \`${table}\``);
      if (c > 0) { console.log(`- ${table}: MySQL already has ${c} rows, skipped (nothing overwritten)`); continue; }
      if (rows.length === 0) { console.log(`- ${table}: empty in SQLite`); continue; }

      const mysqlCols = (await db.query(
        'SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', [table]
      )).map((r) => r.name);
      const cols = Object.keys(rows[0]).filter((k) => mysqlCols.includes(k));

      const conn = await db.beginTransaction();
      try {
        for (const row of rows) {
          const vals = cols.map((k) => {
            let v = row[k];
            // SQLite stores ISO strings; MySQL wants 'YYYY-MM-DD HH:MM:SS'
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
              v = new Date(v).toISOString().slice(0, 19).replace('T', ' ');
            }
            return v === undefined ? null : v;
          });
          await db.query(
            `INSERT INTO \`${table}\` (${cols.map((c2) => `\`${c2}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
            vals, conn
          );
        }
        await db.commitTransaction(conn);
        console.log(`- ${table}: copied ${rows.length} rows`);
      } catch (e) {
        await db.rollbackTransaction(conn);
        throw new Error(`${table}: ${e.message} (this table was rolled back)`);
      }
    }
    src.close();
    await db.close();
    console.log('Import finished.');
  } catch (err) {
    console.error('Import failed:', err.message);
    process.exit(1);
  }
})();
