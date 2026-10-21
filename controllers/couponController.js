const db = require('../config/db');

let tableInitialized = false;

// Ensure coupons table exists and seed initial coupons if empty
async function ensureTable() {
  if (tableInitialized) return;
  try {
    if (db.getDbType() === 'mysql') {
      // Normally created by `npm run migrate`; kept here so the endpoint never breaks.
      await db.query(`
        CREATE TABLE IF NOT EXISTS coupons (
          id INT AUTO_INCREMENT PRIMARY KEY,
          code VARCHAR(50) UNIQUE NOT NULL,
          description VARCHAR(255),
          discount_type VARCHAR(20) DEFAULT 'percent',
          discount_value DECIMAL(10, 2) NOT NULL,
          min_spend DECIMAL(10, 2) DEFAULT 0.00,
          max_discount DECIMAL(10, 2) DEFAULT 0.00,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await db.query(`
        CREATE TABLE IF NOT EXISTS coupons (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          code TEXT UNIQUE NOT NULL,
          description TEXT,
          discount_type TEXT DEFAULT 'percent',
          discount_value REAL NOT NULL,
          min_spend REAL DEFAULT 0.00,
          max_discount REAL DEFAULT 0.00,
          status TEXT DEFAULT 'active',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    const existing = await db.query('SELECT count(*) as count FROM coupons');
    const count = existing[0]?.count || existing[0]?.['count(*)'] || 0;

    if (count === 0) {
      const initialCoupons = [
        ['WELCOME10', '10% Off on all cosmetics items', 'percent', 10, 0, 0],
        ['GLOW20', '20% Off for orders above Rs. 2,000', 'percent', 20, 2000, 1000],
        ['BEAUTY15', '15% Off Storewide discount', 'percent', 15, 1000, 0],
        ['SAVE500', 'Flat Rs. 500 Off on orders above Rs. 3,000', 'amount', 500, 3000, 500],
        ['LIPSTICK50', 'Special 50% Off Promo Voucher', 'percent', 50, 1000, 2500],
        ['VIP25', '25% VIP Club exclusive discount', 'percent', 25, 2500, 2000]
      ];

      for (const [code, desc, type, val, minSpend, maxDisc] of initialCoupons) {
        try {
          await db.query(`
            INSERT INTO coupons (code, description, discount_type, discount_value, min_spend, max_discount, status)
            VALUES (?, ?, ?, ?, ?, ?, 'active')
          `, [code, desc, type, val, minSpend, maxDisc]);
        } catch (e) {
          // ignore duplicate on race
        }
      }
      console.log('Seeded initial coupons.');
    }
    tableInitialized = true;
  } catch (err) {
    console.error('ensureTable error:', err.message);
  }
}

// Get active coupons
exports.getCoupons = async (req, res) => {
  try {
    await ensureTable();
    const coupons = await db.query(
      "SELECT id, code, description, discount_type, discount_value, min_spend, max_discount, status FROM coupons WHERE status = 'active' ORDER BY id ASC"
    );
    return res.json(coupons);
  } catch (err) {
    console.error('Get Coupons Error:', err);
    return res.status(500).json({ message: 'Unable to fetch coupons.' });
  }
};

// Validate a coupon against current subtotal
exports.validateCoupon = async (req, res) => {
  try {
    await ensureTable();
    const { code, subtotal } = req.body;
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ valid: false, message: 'Please provide a coupon code.' });
    }

    const cleanCode = code.trim().toUpperCase();
    const rows = await db.query(
      "SELECT * FROM coupons WHERE UPPER(code) = ? AND status = 'active' LIMIT 1",
      [cleanCode]
    );

    if (rows.length === 0) {
      return res.status(404).json({ valid: false, message: `Coupon code "${cleanCode}" is invalid or expired.` });
    }

    const coupon = rows[0];
    const currentSubtotal = parseFloat(subtotal || 0);

    // Check minimum spend requirement
    const minSpend = parseFloat(coupon.min_spend || 0);
    if (minSpend > 0 && currentSubtotal < minSpend) {
      return res.status(400).json({
        valid: false,
        message: `Coupon "${coupon.code}" requires a minimum spend of Rs. ${minSpend.toLocaleString()}. (Current: Rs. ${currentSubtotal.toLocaleString()})`
      });
    }

    // Calculate discount amount
    let discountAmount = 0;
    const discountVal = parseFloat(coupon.discount_value || 0);

    if (coupon.discount_type === 'percent') {
      discountAmount = (currentSubtotal * discountVal) / 100;
      const maxDiscount = parseFloat(coupon.max_discount || 0);
      if (maxDiscount > 0 && discountAmount > maxDiscount) {
        discountAmount = maxDiscount;
      }
    } else {
      discountAmount = discountVal;
    }

    discountAmount = Math.min(currentSubtotal, Math.max(0, discountAmount));

    return res.json({
      valid: true,
      message: `Coupon "${coupon.code}" applied successfully!`,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discount_type: coupon.discount_type,
        discount_value: discountVal,
        min_spend: minSpend,
        max_discount: parseFloat(coupon.max_discount || 0),
        discount_amount: parseFloat(discountAmount.toFixed(2))
      }
    });
  } catch (err) {
    console.error('Validate Coupon Error:', err);
    return res.status(500).json({ valid: false, message: 'Unable to validate coupon.' });
  }
};

// Create a new coupon
exports.createCoupon = async (req, res) => {
  try {
    await ensureTable();
    const { code, description, discount_type, discount_value, min_spend, max_discount } = req.body;
    if (!code || !discount_value) {
      return res.status(400).json({ message: 'Coupon code and discount value are required.' });
    }

    const cleanCode = code.trim().toUpperCase();
    await db.query(`
      INSERT INTO coupons (code, description, discount_type, discount_value, min_spend, max_discount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'active')
    `, [
      cleanCode,
      description || '',
      discount_type || 'percent',
      parseFloat(discount_value),
      parseFloat(min_spend || 0),
      parseFloat(max_discount || 0)
    ]);

    return res.status(201).json({ message: `Coupon "${cleanCode}" created successfully.` });
  } catch (err) {
    console.error('Create Coupon Error:', err);
    return res.status(500).json({ message: 'Unable to create coupon. Code might already exist.' });
  }
};

// Delete a coupon
exports.deleteCoupon = async (req, res) => {
  try {
    await ensureTable();
    const { id } = req.params;
    await db.query('DELETE FROM coupons WHERE id = ?', [id]);
    return res.json({ message: 'Coupon deleted successfully.' });
  } catch (err) {
    console.error('Delete Coupon Error:', err);
    return res.status(500).json({ message: 'Unable to delete coupon.' });
  }
};
