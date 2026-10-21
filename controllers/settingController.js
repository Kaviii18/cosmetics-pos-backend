const db = require('../config/db');

exports.getSettings = async (req, res) => {
  try {
    const settings = await db.query('SELECT * FROM settings LIMIT 1');
    if (settings.length === 0) {
      return res.json({
        shop_name: 'Velvet Touch Cosmetics',
        shop_address: '123 Beauty Boulevard, Colombo 03',
        shop_phone: '+94 11 234 5678',
        cashier_name: 'Cashier',
        currency: 'Rs.',
        receipt_width: '58mm',
        tax_rate: 0.00,
        default_discount: 0.00,
        low_stock_threshold: 5,
        logo_url: '',
        printer_bridge_url: 'http://localhost:9100',
        printer_auto_print: 1,
        printer_model: 'YHD-5808L'
      });
    }
    const s = settings[0];
    if (!s.cashier_name) s.cashier_name = 'Cashier';
    if (!s.logo_url) s.logo_url = '';
    if (!s.printer_bridge_url) s.printer_bridge_url = 'http://localhost:9100';
    if (s.printer_auto_print === undefined || s.printer_auto_print === null) s.printer_auto_print = 1;
    if (!s.printer_model) s.printer_model = 'YHD-5808L';
    return res.json(s);
  } catch (err) {
    return res.status(500).json({ message: 'Unable to load settings.' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const {
      shop_name, shop_address, shop_phone, cashier_name, currency, receipt_width,
      tax_rate, default_discount, low_stock_threshold, logo_url,
      printer_bridge_url, printer_auto_print, printer_model
    } = req.body;

    // MySQL gets these columns from `npm run migrate`; the local SQLite fallback adds them lazily.
    if (db.getDbType() === 'sqlite') {
      const cols = [
        "cashier_name TEXT DEFAULT 'Cashier'", "logo_url TEXT DEFAULT ''",
        "printer_bridge_url TEXT DEFAULT 'http://localhost:9100'",
        'printer_auto_print INTEGER DEFAULT 1', "printer_model TEXT DEFAULT 'YHD-5808L'"
      ];
      for (const col of cols) {
        try { await db.query(`ALTER TABLE settings ADD COLUMN ${col}`); } catch (e) { /* exists */ }
      }
    }

    const existing = await db.query('SELECT id FROM settings LIMIT 1');
    const autoPrintVal = (printer_auto_print === true || printer_auto_print === 1 || printer_auto_print === '1') ? 1 : 0;
    const bridgeUrlVal = printer_bridge_url || 'http://localhost:9100';
    const printerModelVal = printer_model || 'YHD-5808L';

    if (existing.length === 0) {
      await db.query(`
        INSERT INTO settings (
          shop_name, shop_address, shop_phone, cashier_name, currency, receipt_width,
          tax_rate, default_discount, low_stock_threshold, logo_url,
          printer_bridge_url, printer_auto_print, printer_model
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        shop_name || 'Velvet Touch Cosmetics', shop_address || '', shop_phone || '',
        cashier_name || 'Cashier', currency || 'Rs.', receipt_width || '58mm',
        parseFloat(tax_rate || 0), parseFloat(default_discount || 0), parseInt(low_stock_threshold || 5),
        logo_url || '', bridgeUrlVal, autoPrintVal, printerModelVal
      ]);
    } else {
      await db.query(`
        UPDATE settings SET
          shop_name = ?, shop_address = ?, shop_phone = ?, cashier_name = ?, currency = ?,
          receipt_width = ?, tax_rate = ?, default_discount = ?, low_stock_threshold = ?, logo_url = ?,
          printer_bridge_url = ?, printer_auto_print = ?, printer_model = ?
        WHERE id = ?
      `, [
        shop_name, shop_address, shop_phone, cashier_name || 'Cashier', currency, receipt_width,
        parseFloat(tax_rate || 0), parseFloat(default_discount || 0),
        parseInt(low_stock_threshold || 5), logo_url !== undefined ? logo_url : '',
        bridgeUrlVal, autoPrintVal, printerModelVal,
        existing[0].id
      ]);
    }

    return res.json({ message: 'Settings updated successfully.' });
  } catch (err) {
    console.error('Update Settings Error:', err);
    return res.status(500).json({ message: 'Unable to save settings.' });
  }
};
