const db = require('../config/db');

exports.getDashboardData = async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);

    // Today's Sales & Orders
    const todaySales = await db.query(`
      SELECT 
        COALESCE(SUM(grand_total), 0) as total_sales,
        COUNT(id) as total_orders
      FROM sales 
      WHERE DATE(created_at) = ?
    `, [today]);

    // Total Products & Low Stock Count
    const totalProducts = await db.query('SELECT COUNT(*) as count FROM products');
    const lowStockProducts = await db.query("SELECT COUNT(*) as count FROM products WHERE status IN ('low_stock', 'out_of_stock')");
    const totalCustomers = await db.query('SELECT COUNT(*) as count FROM customers');

    // Recent 10 Sales
    const recentSales = await db.query('SELECT * FROM sales ORDER BY created_at DESC LIMIT 10');

    // Low Stock Alert List
    const lowStockAlerts = await db.query("SELECT * FROM products WHERE status IN ('low_stock', 'out_of_stock') ORDER BY current_stock ASC LIMIT 10");

    // Chart Data (Last 7 Days Sales)
    const salesChart = await db.query(`
      SELECT 
        DATE(created_at) as date,
        COALESCE(SUM(grand_total), 0) as total_amount,
        COUNT(id) as order_count
      FROM sales
      GROUP BY DATE(created_at)
      ORDER BY DATE(created_at) DESC
      LIMIT 14
    `);

    return res.json({
      today_sales: parseFloat(todaySales[0].total_sales || 0),
      today_orders: parseInt(todaySales[0].total_orders || 0),
      total_products: parseInt(totalProducts[0].count || totalProducts[0]['COUNT(*)'] || 0),
      low_stock_count: parseInt(lowStockProducts[0].count || lowStockProducts[0]['COUNT(*)'] || 0),
      total_customers: parseInt(totalCustomers[0].count || totalCustomers[0]['COUNT(*)'] || 0),
      recent_sales: recentSales,
      low_stock_alerts: lowStockAlerts,
      sales_chart: salesChart.reverse()
    });
  } catch (err) {
    console.error('Dashboard Data Error:', err);
    return res.status(500).json({ message: 'Unable to load dashboard data.' });
  }
};

exports.getReports = async (req, res) => {
  try {
    const { range, startDate, endDate } = req.query;
    let dateFilter = '';
    const params = [];

    const now = new Date();
    if (range === 'today') {
      const todayStr = now.toISOString().slice(0, 10);
      dateFilter = ' WHERE DATE(created_at) = ?';
      params.push(todayStr);
    } else if (range === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      dateFilter = ' WHERE created_at >= ?';
      params.push(weekAgo);
    } else if (range === 'month') {
      const yearMonth = now.toISOString().slice(0, 7);
      dateFilter = ' WHERE created_at LIKE ?';
      params.push(`${yearMonth}%`);
    } else if (range === 'custom' && startDate && endDate) {
      dateFilter = ' WHERE created_at >= ? AND created_at <= ?';
      params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
    }

    // Sales Metrics
    const salesSummary = await db.query(`
      SELECT 
        COALESCE(SUM(grand_total), 0) as total_revenue,
        COUNT(id) as total_orders,
        COALESCE(AVG(grand_total), 0) as avg_order_value,
        COALESCE(SUM(discount), 0) as total_discounts
      FROM sales ${dateFilter}
    `, params);

    // Top Selling Products
    const topProducts = await db.query(`
      SELECT 
        product_name,
        SUM(quantity) as total_qty,
        SUM(total_price) as total_sales
      FROM sale_items
      GROUP BY product_name
      ORDER BY total_qty DESC
      LIMIT 8
    `);

    // Inventory Stats
    const inStock = await db.query("SELECT COUNT(*) as count FROM products WHERE status = 'in_stock'");
    const lowStock = await db.query("SELECT COUNT(*) as count FROM products WHERE status = 'low_stock'");
    const outOfStock = await db.query("SELECT COUNT(*) as count FROM products WHERE status = 'out_of_stock'");

    return res.json({
      range: range || 'month',
      summary: {
        total_revenue: parseFloat(salesSummary[0].total_revenue || 0),
        total_orders: parseInt(salesSummary[0].total_orders || 0),
        avg_order_value: parseFloat(salesSummary[0].avg_order_value || 0),
        total_discounts: parseFloat(salesSummary[0].total_discounts || 0)
      },
      top_products: topProducts,
      inventory_summary: {
        in_stock: parseInt(inStock[0].count || inStock[0]['COUNT(*)'] || 0),
        low_stock: parseInt(lowStock[0].count || lowStock[0]['COUNT(*)'] || 0),
        out_of_stock: parseInt(outOfStock[0].count || outOfStock[0]['COUNT(*)'] || 0)
      }
    });
  } catch (err) {
    console.error('Reports Error:', err);
    return res.status(500).json({ message: 'Unable to generate reports.' });
  }
};
