const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const db = require('./config/db');
const { verifyToken, getJwtSecret } = require('./middleware/authMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

// Fail at startup (not on the first login) if the JWT secret is missing in production
getJwtSecret();

// Railway sits behind a reverse proxy: needed for correct client IPs (rate limiting)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// CORS: only the origins listed in FRONTEND_URL (comma separated), e.g. https://my-pos.netlify.app
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);
if (isProduction && allowedOrigins.length === 0) {
  console.warn('WARNING: FRONTEND_URL is not set. Browsers will be blocked by CORS until you set it.');
}
app.use(cors({
  origin(origin, callback) {
    // no Origin header = curl / health checks / server-to-server: allowed
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // local development convenience (never in production)
    if (!isProduction && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return callback(null, true);
    return callback(null, false);
  },
  exposedHeaders: ['X-Total-Count']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check (public). Also verifies the database connection.
app.get('/api/health', async (req, res) => {
  try {
    await db.ping();
    res.json({ status: 'OK', database: 'connected', dbType: db.getDbType(), time: new Date() });
  } catch (err) {
    res.status(503).json({ status: 'ERROR', database: 'unavailable', time: new Date() });
  }
});

// Slow down password guessing
app.use('/api/auth/login', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Please try again in a few minutes.' }
}));

// Auth routes decide per-endpoint what they need; everything else requires a valid login.
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/products', verifyToken, require('./routes/productRoutes'));
app.use('/api/categories', verifyToken, require('./routes/categoryRoutes'));
app.use('/api/customers', verifyToken, require('./routes/customerRoutes'));
app.use('/api/inventory', verifyToken, require('./routes/inventoryRoutes'));
app.use('/api/sales', verifyToken, require('./routes/saleRoutes'));
app.use('/api/reports', verifyToken, require('./routes/reportRoutes'));
app.use('/api/settings', verifyToken, require('./routes/settingRoutes'));
app.use('/api/coupons', verifyToken, require('./routes/couponRoutes'));

app.use('/api', (req, res) => res.status(404).json({ message: 'Endpoint not found.' }));

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({ message: 'Internal server error occurred.' });
});

// Initialize DB and start server
db.initDb().then(() => {
  app.listen(PORT, HOST, () => {
    console.log(`Cosmetics POS API listening on ${HOST}:${PORT} (${isProduction ? 'production' : 'development'}, db: ${db.getDbType()})`);
  });
}).catch((err) => {
  console.error('Failed to initialize Database:', err.message);
  process.exit(1);
});
