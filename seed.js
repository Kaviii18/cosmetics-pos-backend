const bcrypt = require('bcryptjs');
const db = require('./config/db');

async function seed() {
  try {
    await db.initDb();
    console.log('--- Initializing Tables ---');

    const dbType = db.getDbType();

    if (dbType === 'sqlite') {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password TEXT NOT NULL,
          role TEXT DEFAULT 'cashier',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          icon TEXT DEFAULT 'Tag',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS products (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          brand TEXT NOT NULL,
          category_id INTEGER,
          category_name TEXT NOT NULL,
          description TEXT,
          sku TEXT UNIQUE NOT NULL,
          barcode TEXT UNIQUE NOT NULL,
          buying_price REAL DEFAULT 0.00,
          selling_price REAL DEFAULT 0.00,
          current_stock INTEGER DEFAULT 0,
          minimum_stock INTEGER DEFAULT 5,
          image_url TEXT,
          expiry_date TEXT,
          status TEXT DEFAULT 'in_stock',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS customers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          phone TEXT UNIQUE NOT NULL,
          email TEXT,
          total_purchases REAL DEFAULT 0.00,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS sales (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          invoice_no TEXT UNIQUE NOT NULL,
          customer_id INTEGER,
          customer_name TEXT DEFAULT 'Walk-in Customer',
          user_id INTEGER NOT NULL,
          cashier_name TEXT NOT NULL,
          subtotal REAL NOT NULL,
          discount REAL DEFAULT 0.00,
          tax REAL DEFAULT 0.00,
          grand_total REAL NOT NULL,
          payment_method TEXT DEFAULT 'Cash',
          cash_received REAL DEFAULT 0.00,
          change_amount REAL DEFAULT 0.00,
          status TEXT DEFAULT 'Completed',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS sale_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sale_id INTEGER NOT NULL,
          product_id INTEGER NOT NULL,
          product_name TEXT NOT NULL,
          sku TEXT NOT NULL,
          unit_price REAL NOT NULL,
          buying_price REAL DEFAULT 0.00,
          quantity INTEGER NOT NULL,
          total_price REAL NOT NULL
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS inventory_transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          product_id INTEGER NOT NULL,
          product_name TEXT NOT NULL,
          type TEXT NOT NULL,
          quantity_changed INTEGER NOT NULL,
          previous_stock INTEGER NOT NULL,
          new_stock INTEGER NOT NULL,
          note TEXT,
          user_name TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await db.query(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          shop_name TEXT DEFAULT 'Velvet Touch Cosmetics',
          shop_address TEXT,
          shop_phone TEXT DEFAULT '+94 11 234 5678',
          currency TEXT DEFAULT 'Rs.',
          receipt_width TEXT DEFAULT '80mm',
          tax_rate REAL DEFAULT 0.00,
          default_discount REAL DEFAULT 0.00,
          low_stock_threshold INTEGER DEFAULT 5
        );
      `);
    } else {
      // MySQL: create tables from config/schema.sql (idempotent, never selects/creates a database)
      await require('./scripts/migrate').migrate();
    }
    console.log('Tables setup complete. Seeding data...');

    // Seed Settings
    const settings = await db.query('SELECT * FROM settings');
    if (settings.length === 0) {
      await db.query(`
        INSERT INTO settings (shop_name, shop_address, shop_phone, currency, receipt_width, tax_rate, default_discount, low_stock_threshold)
        VALUES ('Velvet Touch Cosmetics', '123 Beauty Boulevard, Cinnamon Gardens, Colombo 03', '+94 11 234 5678', 'Rs.', '80mm', 0.00, 0.00, 5)
      `);
    }

    // Seed Users
    const users = await db.query('SELECT * FROM users');
    if (users.length === 0) {
      // Demo accounts are for LOCAL DEVELOPMENT only. In production use `npm run create-admin`.
      if (process.env.NODE_ENV === 'production') {
        throw new Error('Refusing to seed demo users in production. Use `npm run create-admin` instead.');
      }
      const adminPass = await bcrypt.hash('admin123', 10);
      const cashierPass = await bcrypt.hash('cashier123', 10);
      
      await db.query(`
        INSERT INTO users (name, email, password, role) VALUES 
        ('Admin', 'admin@velvettouch.lk', ?, 'admin'),
        ('Sanduni Perera', 'cashier@velvettouch.lk', ?, 'cashier')
      `, [adminPass, cashierPass]);
      console.log('Seeded Users (Admin & Cashier)');
    }

    // Seed Categories
    const categoriesList = [
      { name: 'Makeup', icon: 'Sparkles' },
      { name: 'Skincare', icon: 'Heart' },
      { name: 'Haircare', icon: 'Scissors' },
      { name: 'Fragrance', icon: 'Sun' },
      { name: 'Lip Products', icon: 'Smile' },
      { name: 'Face Products', icon: 'User' },
      { name: 'Eye Products', icon: 'Eye' },
      { name: 'Accessories', icon: 'Package' },
      { name: 'Other', icon: 'Tag' }
    ];

    for (const cat of categoriesList) {
      const existing = await db.query('SELECT * FROM categories WHERE name = ?', [cat.name]);
      if (existing.length === 0) {
        await db.query('INSERT INTO categories (name, icon) VALUES (?, ?)', [cat.name, cat.icon]);
      }
    }

    // Expanded Cosmetics Product Catalog with Verified Images & Categories
    const productsList = [
      {
        name: 'Maybelline Fit Me Matte Foundation',
        brand: 'Maybelline',
        category_name: 'Face Products',
        description: 'Poreless liquid foundation for natural matte finish. Shade 120 Classic Ivory.',
        sku: 'SKU-MAY-001',
        barcode: '890150000001',
        buying_price: 2400.00,
        selling_price: 3250.00,
        current_stock: 18,
        minimum_stock: 5,
        image_url: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-12-31'
      },
      {
        name: 'MAC Retro Matte Lipstick - Ruby Woo',
        brand: 'MAC Cosmetics',
        category_name: 'Lip Products',
        description: 'Iconic vivid blue-red shade with an ultra-matte finish.',
        sku: 'SKU-MAC-002',
        barcode: '890150000002',
        buying_price: 5200.00,
        selling_price: 6800.00,
        current_stock: 14,
        minimum_stock: 5,
        image_url: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-08-31'
      },
      {
        name: 'L\'Oréal Lash Paradise Mascara',
        brand: 'L\'Oréal Paris',
        category_name: 'Eye Products',
        description: 'Voluptuous volume and intense length. Blackest Black formula.',
        sku: 'SKU-LOR-003',
        barcode: '890150000003',
        buying_price: 2100.00,
        selling_price: 2950.00,
        current_stock: 22,
        minimum_stock: 6,
        image_url: 'https://images.unsplash.com/photo-1560700146-1c430c576880?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2026-11-30'
      },
      {
        name: 'The Ordinary Niacinamide 10% + Zinc 1%',
        brand: 'The Ordinary',
        category_name: 'Skincare',
        description: 'High-strength vitamin and mineral blemish formula. 30ml.',
        sku: 'SKU-ORD-004',
        barcode: '890150000004',
        buying_price: 2800.00,
        selling_price: 3900.00,
        current_stock: 25,
        minimum_stock: 8,
        image_url: 'https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2028-01-15'
      },
      {
        name: 'Clinique Moisture Surge 100H Hydrator',
        brand: 'Clinique',
        category_name: 'Skincare',
        description: 'Oil-free gel-cream moisturizer with Aloe Bio-ferment + Hyaluronic Acid. 50ml.',
        sku: 'SKU-CLI-005',
        barcode: '890150000005',
        buying_price: 8800.00,
        selling_price: 11500.00,
        current_stock: 8,
        minimum_stock: 4,
        image_url: 'https://images.unsplash.com/photo-1608248597263-000799965d14?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-06-30'
      },
      {
        name: 'Fenty Beauty Gloss Bomb Lip Luminizer',
        brand: 'Fenty Beauty',
        category_name: 'Lip Products',
        description: 'Ultimate gotta-have-it lip gloss with explosive shine. Fenty Glow shade.',
        sku: 'SKU-FEN-006',
        barcode: '890150000006',
        buying_price: 5600.00,
        selling_price: 7400.00,
        current_stock: 11,
        minimum_stock: 5,
        image_url: 'https://images.unsplash.com/photo-1599733589046-9b8308b5b50d?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-10-31'
      },
      {
        name: 'NARS Radiant Creamy Concealer',
        brand: 'NARS',
        category_name: 'Face Products',
        description: 'Award-winning liquid concealer delivering multi-action 16-hour perfection.',
        sku: 'SKU-NAR-007',
        barcode: '890150000007',
        buying_price: 6800.00,
        selling_price: 8900.00,
        current_stock: 15,
        minimum_stock: 5,
        image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-05-31'
      },
      {
        name: 'Maybelline SuperStay Matte Ink Lip Color',
        brand: 'Maybelline',
        category_name: 'Lip Products',
        description: 'Up to 16-hour saturated liquid matte lipstick. Pioneer shade.',
        sku: 'SKU-MAY-008',
        barcode: '890150000008',
        buying_price: 2000.00,
        selling_price: 2850.00,
        current_stock: 3,
        minimum_stock: 10,
        image_url: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2026-12-31'
      },
      {
        name: 'Olaplex No. 3 Hair Perfector',
        brand: 'Olaplex',
        category_name: 'Haircare',
        description: 'At-home bond building treatment that reduces breakage and visibly strengthens hair.',
        sku: 'SKU-OLA-009',
        barcode: '890150000009',
        buying_price: 7400.00,
        selling_price: 9800.00,
        current_stock: 5,
        minimum_stock: 5,
        image_url: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2028-04-30'
      },
      {
        name: 'Victoria\'s Secret Pure Seduction Mist',
        brand: 'Victoria\'s Secret',
        category_name: 'Fragrance',
        description: 'Juicy Plum and Crushed Freesia fragrance body mist spray. 250ml.',
        sku: 'SKU-VIC-010',
        barcode: '890150000010',
        buying_price: 3900.00,
        selling_price: 5400.00,
        current_stock: 16,
        minimum_stock: 5,
        image_url: 'https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2029-01-01'
      },
      {
        name: 'Laneige Lip Sleeping Mask - Berry',
        brand: 'Laneige',
        category_name: 'Lip Products',
        description: 'Nourishing leave-on lip mask enriched with Vitamin C and Antioxidants.',
        sku: 'SKU-LAN-011',
        barcode: '890150000011',
        buying_price: 3800.00,
        selling_price: 5200.00,
        current_stock: 2,
        minimum_stock: 6,
        image_url: 'https://images.unsplash.com/photo-1629732047847-50219e98122a?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-09-30'
      },
      {
        name: 'Real Techniques Eye Brush Set',
        brand: 'Real Techniques',
        category_name: 'Accessories',
        description: 'Essential 8-piece eye shadow and liner blending brush kit.',
        sku: 'SKU-RT-012',
        barcode: '890150000012',
        buying_price: 3500.00,
        selling_price: 4800.00,
        current_stock: 12,
        minimum_stock: 4,
        image_url: 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2030-01-01'
      },
      {
        name: 'Huda Beauty Empowered Eyeshadow Palette',
        brand: 'Huda Beauty',
        category_name: 'Eye Products',
        description: '18-shade ultra-pigmented gold, copper, and neutral eyeshadow palette.',
        sku: 'SKU-HUD-013',
        barcode: '890150000013',
        buying_price: 13500.00,
        selling_price: 18500.00,
        current_stock: 8,
        minimum_stock: 3,
        image_url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2028-06-30'
      },
      {
        name: 'Estée Lauder Advanced Night Repair Serum',
        brand: 'Estée Lauder',
        category_name: 'Skincare',
        description: 'Deep fast repair night serum for radiance and firming. 50ml.',
        sku: 'SKU-EST-014',
        barcode: '890150000014',
        buying_price: 16500.00,
        selling_price: 22000.00,
        current_stock: 6,
        minimum_stock: 3,
        image_url: 'https://images.unsplash.com/photo-1608248597263-000799965d14?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2028-03-31'
      },
      {
        name: 'Urban Decay All Nighter Setting Spray',
        brand: 'Urban Decay',
        category_name: 'Makeup',
        description: 'Long-lasting makeup setting spray up to 16 hour wear. 118ml.',
        sku: 'SKU-URB-015',
        barcode: '890150000015',
        buying_price: 6800.00,
        selling_price: 9200.00,
        current_stock: 14,
        minimum_stock: 4,
        image_url: 'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-11-30'
      },
      {
        name: 'Dior Sauvage Eau De Parfum 100ml',
        brand: 'Dior',
        category_name: 'Fragrance',
        description: 'Sensual bergamot and ambroxan luxury signature fragrance.',
        sku: 'SKU-DIO-016',
        barcode: '890150000016',
        buying_price: 2400.00,
        selling_price: 32000.00,
        current_stock: 7,
        minimum_stock: 2,
        image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2029-05-31'
      },
      {
        name: 'Beautyblender Original Makeup Sponge',
        brand: 'Beautyblender',
        category_name: 'Accessories',
        description: 'Edgeless precision application sponge for streak-free blending.',
        sku: 'SKU-BB-017',
        barcode: '890150000017',
        buying_price: 3800.00,
        selling_price: 5500.00,
        current_stock: 20,
        minimum_stock: 5,
        image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2030-01-01'
      },
      {
        name: 'CeraVe Foaming Facial Cleanser 236ml',
        brand: 'CeraVe',
        category_name: 'Skincare',
        description: 'Cleanses and removes oil with 3 essential ceramides and hyaluronic acid.',
        sku: 'SKU-CER-018',
        barcode: '890150000018',
        buying_price: 3200.00,
        selling_price: 4600.00,
        current_stock: 19,
        minimum_stock: 5,
        image_url: 'https://images.unsplash.com/photo-1556228720-195a672e8a03?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-10-15'
      },
      {
        name: 'Kérastase Elixir Ultime Hair Oil 100ml',
        brand: 'Kérastase',
        category_name: 'Haircare',
        description: 'Nourishing and beautifying hair oil for frizz control and shine.',
        sku: 'SKU-KER-019',
        barcode: '890150000019',
        buying_price: 10500.00,
        selling_price: 14200.00,
        current_stock: 9,
        minimum_stock: 3,
        image_url: 'https://images.unsplash.com/photo-1608248597263-000799965d14?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2028-02-28'
      },
      {
        name: 'Anastasia Beverly Hills Dipbrow Pomade',
        brand: 'Anastasia Beverly Hills',
        category_name: 'Eye Products',
        description: 'Full-pigment waterproof brow pomade. Dark Brown shade.',
        sku: 'SKU-ABH-020',
        barcode: '890150000020',
        buying_price: 4900.00,
        selling_price: 6900.00,
        current_stock: 11,
        minimum_stock: 4,
        image_url: 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-07-31'
      },
      {
        name: 'Rare Beauty Soft Pinch Liquid Blush',
        brand: 'Rare Beauty',
        category_name: 'Face Products',
        description: 'Weightless long-lasting liquid blush for soft flush. Joy shade.',
        sku: 'SKU-RARE-021',
        barcode: '890150000021',
        buying_price: 6200.00,
        selling_price: 8400.00,
        current_stock: 13,
        minimum_stock: 4,
        image_url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-09-30'
      },
      {
        name: 'Chanel No. 5 Eau De Parfum 50ml',
        brand: 'Chanel',
        category_name: 'Fragrance',
        description: 'Timeless luxury floral aldehyde icon fragrance.',
        sku: 'SKU-CHA-022',
        barcode: '890150000022',
        buying_price: 21000.00,
        selling_price: 28500.00,
        current_stock: 4,
        minimum_stock: 2,
        image_url: 'https://images.unsplash.com/photo-1594035910387-fea47794261f?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2029-12-31'
      },
      {
        name: 'Laura Mercier Translucent Loose Powder',
        brand: 'Laura Mercier',
        category_name: 'Makeup',
        description: 'Cult-favorite setting powder creating a soft-focus matte finish. 29g.',
        sku: 'SKU-LM-023',
        barcode: '890150000023',
        buying_price: 8900.00,
        selling_price: 11800.00,
        current_stock: 10,
        minimum_stock: 3,
        image_url: 'https://images.unsplash.com/photo-1631729371254-42c2892f0e6e?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2028-05-31'
      },
      {
        name: 'Dior Addict Lip Glow Balm',
        brand: 'Dior',
        category_name: 'Lip Products',
        description: 'Color-reviver lip balm with cherry oil and shea butter. Pink shade.',
        sku: 'SKU-DIO-024',
        barcode: '890150000024',
        buying_price: 8200.00,
        selling_price: 11200.00,
        current_stock: 7,
        minimum_stock: 3,
        image_url: 'https://images.unsplash.com/photo-1586495777744-4413f21062fa?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2027-11-30'
      },
      {
        name: 'Shiseido Eyelash Curler Professional',
        brand: 'Shiseido',
        category_name: 'Accessories',
        description: 'Award-winning eyelash curler reaching all lashes smoothly.',
        sku: 'SKU-SHI-025',
        barcode: '890150000025',
        buying_price: 2900.00,
        selling_price: 4200.00,
        current_stock: 15,
        minimum_stock: 4,
        image_url: 'https://images.unsplash.com/photo-1526045612212-70caf35c14df?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2030-01-01'
      },
      {
        name: 'Sol de Janeiro Brazilian Bum Bum Cream',
        brand: 'Sol de Janeiro',
        category_name: 'Other',
        description: 'Visibly tightening body cream infused with Guaraná. 240ml.',
        sku: 'SKU-SOL-026',
        barcode: '890150000026',
        buying_price: 11000.00,
        selling_price: 14800.00,
        current_stock: 8,
        minimum_stock: 3,
        image_url: 'https://images.unsplash.com/photo-1608248597263-000799965d14?auto=format&fit=crop&w=400&q=80',
        expiry_date: '2028-04-30'
      }
    ];

    for (const prod of productsList) {
      const existing = await db.query('SELECT * FROM products WHERE sku = ?', [prod.sku]);
      if (existing.length === 0) {
        const catRows = await db.query('SELECT id FROM categories WHERE name = ?', [prod.category_name]);
        const category_id = catRows.length > 0 ? catRows[0].id : null;
        
        const status = prod.current_stock === 0 ? 'out_of_stock' : (prod.current_stock <= prod.minimum_stock ? 'low_stock' : 'in_stock');

        await db.query(`
          INSERT INTO products (name, brand, category_id, category_name, description, sku, barcode, buying_price, selling_price, current_stock, minimum_stock, image_url, expiry_date, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          prod.name, prod.brand, category_id, prod.category_name, prod.description,
          prod.sku, prod.barcode, prod.buying_price, prod.selling_price,
          prod.current_stock, prod.minimum_stock, prod.image_url, prod.expiry_date, status
        ]);
      } else {
        // Update image_url if existing has broken image
        await db.query('UPDATE products SET image_url = ? WHERE sku = ?', [prod.image_url, prod.sku]);
      }
    }

    console.log('Seeded Products Catalog Successfully!');
  } catch (err) {
    console.error('Error during database seed:', err);
    process.exitCode = 1;
  }
}

seed().finally(() => db.close().then(() => process.exit()).catch(() => process.exit()));
