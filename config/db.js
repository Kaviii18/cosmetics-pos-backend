const path = require('path');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

let dbType = 'mysql';
let mysqlPool = null;
let sqliteDb = null;

/**
 * Build MySQL connection settings.
 * Priority: MYSQL_URL / DATABASE_URL  ->  Railway MYSQL* variables  ->  DB_* variables (local dev).
 * No credentials are hardcoded: everything comes from the environment.
 */
function getMysqlConfig() {
  const base = {
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_POOL_SIZE || '10', 10),
    queueLimit: 0,
    multipleStatements: true,
    // DECIMAL / SUM() columns come back as JS numbers (the frontend does arithmetic on them)
    decimalNumbers: true,
    // DATE columns stay 'YYYY-MM-DD' strings (no timezone shifting of expiry dates)
    dateStrings: ['DATE'],
    charset: 'utf8mb4'
  };

  if (process.env.DB_SSL === 'true') {
    base.ssl = { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' };
  }

  const url = process.env.MYSQL_URL || process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    return {
      ...base,
      host: u.hostname,
      port: u.port ? parseInt(u.port, 10) : 3306,
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '')
    };
  }

  return {
    ...base,
    host: process.env.MYSQLHOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.MYSQLPORT || process.env.DB_PORT || '3306', 10),
    user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
    password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
    database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'cosmetics_pos'
  };
}

// Initialize Database connection
async function initDb() {
  const mysql = require('mysql2/promise');
  const cfg = getMysqlConfig();
  try {
    mysqlPool = mysql.createPool(cfg);
    const conn = await mysqlPool.getConnection();
    await conn.query("SET time_zone = '+00:00'");
    conn.release();
    // keep every pooled connection on UTC so TIMESTAMP values are consistent
    mysqlPool.on('connection', (c) => c.query("SET time_zone = '+00:00'"));
    console.log(`Connected to MySQL database "${cfg.database}" at ${cfg.host}:${cfg.port}`);
    dbType = 'mysql';
    return;
  } catch (err) {
    // SQLite is a LOCAL DEVELOPMENT fallback only. On a host such as Railway the disk is wiped
    // on every deploy, so silently falling back would lose data: fail loudly instead.
    if (isProduction || process.env.DB_FALLBACK_SQLITE === 'false') {
      throw new Error(`MySQL connection failed (${err.code || err.message}). Check the database environment variables.`);
    }
    console.warn('MySQL connection failed. Using local SQLite fallback (development only):', err.message);
    dbType = 'sqlite';
    const sqlite3 = require('sqlite3').verbose();
    const dbPath = path.join(__dirname, '..', 'cosmetics_pos.sqlite');
    sqliteDb = new sqlite3.Database(dbPath);
    console.log('Connected to SQLite Database at:', dbPath);
  }
}

function sqliteRun(sql, params) {
  return new Promise((resolve, reject) => {
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('PRAGMA') || trimmed.startsWith('WITH')) {
      sqliteDb.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    } else {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ insertId: this.lastID, affectedRows: this.changes });
      });
    }
  });
}

// Unified Query Function. Pass `conn` (from beginTransaction) to run inside that transaction.
async function query(sql, params = [], conn = null) {
  // mysql2 throws on `undefined` bind values (SQLite treated them as NULL): normalise to NULL
  params = params.map((p) => (p === undefined ? null : p));
  if (dbType === 'mysql') {
    const runner = conn || mysqlPool;
    try {
      const [rows] = await runner.execute(sql, params);
      return rows;
    } catch (err) {
      // Prepared statements cannot run some DDL / multi statements: retry as a plain query,
      // but only for that specific error so real SQL errors are not hidden or re-run.
      if (err && (err.code === 'ER_UNSUPPORTED_PS' || err.errno === 1295)) {
        const [rows] = await runner.query(sql, params);
        return rows;
      }
      throw err;
    }
  }
  return sqliteRun(sql, params);
}

// Transaction Helpers
async function beginTransaction() {
  if (dbType === 'mysql') {
    const conn = await mysqlPool.getConnection();
    await conn.beginTransaction();
    return conn;
  }
  await sqliteRun('BEGIN TRANSACTION', []);
  return null;
}

async function commitTransaction(conn) {
  if (dbType === 'mysql' && conn) {
    await conn.commit();
    conn.release();
  } else {
    await sqliteRun('COMMIT', []);
  }
}

async function rollbackTransaction(conn) {
  if (dbType === 'mysql' && conn) {
    try { await conn.rollback(); } finally { conn.release(); }
  } else {
    try { await sqliteRun('ROLLBACK', []); } catch (e) { /* no active transaction */ }
  }
}

async function ping() {
  await query('SELECT 1 AS ok');
  return true;
}

async function close() {
  if (mysqlPool) await mysqlPool.end();
}

function getDbType() {
  return dbType;
}

module.exports = {
  initDb,
  query,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  ping,
  close,
  getDbType,
  getMysqlConfig
};
