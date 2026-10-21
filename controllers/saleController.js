const db = require('../config/db');

// Sales are processed one at a time. With the SQLite fallback every request shares ONE
// connection, so overlapping BEGIN/COMMIT/ROLLBACK calls (e.g. a sync retry arriving while the
// first attempt is still committing) corrupt each other. Serialising also makes the
// invoice_no idempotency check race-free: the 2nd identical request always sees the 1st sale.
let saleQueueTail = Promise.resolve();
function serialize(task) {
  const run = saleQueueTail.then(task, task);
  saleQueueTail = run.catch(() => {});
  return run;
}

exports.createSale = (req, res) => serialize(() => createSaleImpl(req, res));

async function createSaleImpl(req, res) {
  let conn = null;
  try {
    const {
      customer_id, customer_name, items, subtotal, discount, tax, grand_total,
      payment_method, cash_received, change_amount, coupon_code
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'Cannot complete sale with an empty cart.' });
    }

    if (grand_total === undefined || !Number.isFinite(parseFloat(grand_total)) || parseFloat(grand_total) < 0) {
      return res.status(400).json({ message: 'Invalid total amount.' });
    }

    for (const item of items) {
      const qty = Number(item.quantity);
      const price = parseFloat(item.selling_price ?? item.unit_price);
      if (!item.product_id || !Number.isInteger(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
        return res.status(400).json({ message: 'Invalid item in cart (product, quantity or price).' });
      }
    }

    // The local SQLite fallback needs this column added lazily; MySQL gets it from `npm run migrate`.
    if (db.getDbType() === 'sqlite') {
      try {
        await db.query(`ALTER TABLE sales ADD COLUMN coupon_code TEXT DEFAULT ''`);
      } catch (e) {
        // Column already exists
      }
    }

    // Determine Invoice Number (use provided if offline sale, or generate new)
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 7).replace('-', '');
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const invoiceNo = req.body.invoice_no || `INV-${dateStr}-${randomSuffix}`;

    // Idempotency check for offline sync (avoid duplicate inserts if re-synced)
    const existingSale = await db.query('SELECT id FROM sales WHERE invoice_no = ?', [invoiceNo]);
    if (existingSale.length > 0) {
      const saleId = existingSale[0].id;
      const savedSale = await db.query('SELECT * FROM sales WHERE id = ?', [saleId]);
      const savedItems = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
      return res.status(200).json({
        message: 'Sale already synced',
        sale: {
          ...savedSale[0],
          items: savedItems
        }
      });
    }

    // For offline synced sales, do not fail on stock discrepancy since goods are already sold
    const isOfflineSync = req.body.is_offline === true;
    if (!isOfflineSync) {
      // Verify stock availability
      for (const item of items) {
        const pRows = await db.query('SELECT name, current_stock FROM products WHERE id = ?', [item.product_id]);
        if (pRows.length === 0) {
          return res.status(400).json({ message: `Product "${item.name || 'Unknown'}" no longer exists.` });
        }
        const prod = pRows[0];
        if (prod.current_stock < item.quantity) {
          return res.status(400).json({
            message: `Insufficient stock for "${prod.name}". Available stock: ${prod.current_stock}, requested: ${item.quantity}.`
          });
        }
      }
    }

    conn = await db.beginTransaction();

    let cashierName = req.body.cashier_name;
    if (!cashierName) {
      try {
        const settingsRows = await db.query('SELECT cashier_name FROM settings LIMIT 1');
        if (settingsRows.length > 0 && settingsRows[0].cashier_name) {
          cashierName = settingsRows[0].cashier_name;
        } else {
          cashierName = 'Cashier';
        }
      } catch (e) {
        cashierName = 'Cashier';
      }
    }
    // The cashier identity comes from the verified login token, not from the request body
    const userId = req.user.id;
    cashierName = req.user.name || cashierName;
    // MySQL TIMESTAMP wants 'YYYY-MM-DD HH:MM:SS' (UTC); offline sales send ISO strings
    const parsedDate = req.body.created_at ? new Date(req.body.created_at) : new Date();
    const createdAt = (isNaN(parsedDate.getTime()) ? new Date() : parsedDate)
      .toISOString().slice(0, 19).replace('T', ' ');

    // Insert into sales table
    const saleRes = await db.query(`
      INSERT INTO sales (invoice_no, customer_id, customer_name, user_id, cashier_name, subtotal, discount, tax, grand_total, payment_method, cash_received, change_amount, status, coupon_code, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Completed', ?, ?)
    `, [
      invoiceNo, customer_id || null, customer_name || 'Walk-in Customer', userId, cashierName,
      parseFloat(subtotal || 0), parseFloat(discount || 0), parseFloat(tax || 0),
      parseFloat(grand_total), payment_method || 'Cash', parseFloat(cash_received || grand_total),
      parseFloat(change_amount || 0), coupon_code || '', createdAt
    ], conn);

    // Handle mysql vs sqlite insertId
    const saleId = saleRes.insertId;

    // Insert Sale Items & Update Product Stock
    for (const item of items) {
      // Insert item
      await db.query(`
        INSERT INTO sale_items (sale_id, product_id, product_name, sku, unit_price, buying_price, quantity, total_price)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        saleId, item.product_id, item.name || 'Item', item.sku || 'N/A',
        parseFloat(item.selling_price || item.unit_price), parseFloat(item.buying_price || 0),
        parseInt(item.quantity), parseFloat(item.total_price || (item.selling_price * item.quantity))
      ], conn);

      // Decrement product stock
      const pRows = await db.query('SELECT current_stock, minimum_stock FROM products WHERE id = ?', [item.product_id], conn);
      if (pRows.length > 0) {
        const prevStock = pRows[0].current_stock;
        const minStock = pRows[0].minimum_stock;
        const newStock = Math.max(0, prevStock - parseInt(item.quantity));
        let newStatus = 'in_stock';
        if (newStock === 0) newStatus = 'out_of_stock';
        else if (newStock <= minStock) newStatus = 'low_stock';

        await db.query(
          'UPDATE products SET current_stock = ?, status = ? WHERE id = ?',
          [newStock, newStatus, item.product_id], conn
        );

        // Record inventory transaction
        await db.query(`
          INSERT INTO inventory_transactions (product_id, product_name, type, quantity_changed, previous_stock, new_stock, note, user_name)
          VALUES (?, ?, 'Sale', ?, ?, ?, ?, ?)
        `, [item.product_id, item.name || 'Item', -parseInt(item.quantity), prevStock, newStock, `Sale Invoice ${invoiceNo}`, cashierName], conn);
      }
    }

    // Update Customer Total Purchases if customer selected
    if (customer_id) {
      await db.query(
        'UPDATE customers SET total_purchases = total_purchases + ? WHERE id = ?',
        [parseFloat(grand_total), customer_id], conn
      );
    }

    await db.commitTransaction(conn);

    // Fetch complete saved sale for receipt
    const savedSale = await db.query('SELECT * FROM sales WHERE id = ?', [saleId]);
    const savedItems = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);

    return res.status(201).json({
      message: 'Sale completed successfully',
      sale: {
        ...savedSale[0],
        items: savedItems
      }
    });
  } catch (err) {
    if (conn) await db.rollbackTransaction(conn);

    // Two requests with the same invoice_no raced (e.g. a retry while the first was still committing):
    // the UNIQUE(invoice_no) constraint rejected the second one -> treat as "already synced".
    const isDuplicate = err && (err.code === 'ER_DUP_ENTRY' || err.code === 'SQLITE_CONSTRAINT' ||
      /UNIQUE constraint failed: sales\.invoice_no/i.test(err.message || ''));
    if (isDuplicate && req.body && req.body.invoice_no) {
      try {
        const existing = await db.query('SELECT * FROM sales WHERE invoice_no = ?', [req.body.invoice_no]);
        if (existing.length > 0) {
          const existingItems = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [existing[0].id]);
          return res.status(200).json({ message: 'Sale already synced', sale: { ...existing[0], items: existingItems } });
        }
      } catch (lookupErr) {
        console.error('Duplicate lookup failed:', lookupErr);
      }
    }

    console.error('Create Sale Error:', err);
    return res.status(500).json({ message: 'Unable to complete the sale. Please try again.' });
  }
}

// Get Sales List
exports.getSales = async (req, res) => {
  try {
    const { search, startDate, endDate, paymentMethod } = req.query;
    let sql = 'SELECT * FROM sales WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (invoice_no LIKE ? OR customer_name LIKE ? OR cashier_name LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (startDate) {
      sql += ' AND created_at >= ?';
      params.push(`${startDate} 00:00:00`);
    }

    if (endDate) {
      sql += ' AND created_at <= ?';
      params.push(`${endDate} 23:59:59`);
    }

    if (paymentMethod && paymentMethod !== 'All') {
      sql += ' AND payment_method = ?';
      params.push(paymentMethod);
    }

    sql += ' ORDER BY created_at DESC';
    const sales = await db.query(sql, params);

    return res.json(sales);
  } catch (err) {
    console.error('Get Sales Error:', err);
    return res.status(500).json({ message: 'Unable to fetch sales history.' });
  }
};

// Get Sale Details by Invoice No or ID
exports.getSaleByInvoice = async (req, res) => {
  try {
    const { invoiceNo } = req.params;
    const sales = await db.query(
      'SELECT * FROM sales WHERE invoice_no = ? OR id = ?',
      [invoiceNo, invoiceNo]
    );

    if (sales.length === 0) {
      return res.status(404).json({ message: 'Invoice not found.' });
    }

    const sale = sales[0];
    const items = await db.query('SELECT * FROM sale_items WHERE sale_id = ?', [sale.id]);

    return res.json({
      ...sale,
      items
    });
  } catch (err) {
    console.error('Get Sale Invoice Error:', err);
    return res.status(500).json({ message: 'Unable to retrieve invoice details.' });
  }
};
