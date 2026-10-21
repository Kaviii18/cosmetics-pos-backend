const jwt = require('jsonwebtoken');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set (at least 16 characters) in production.');
  }
  // Local development only. Never used when NODE_ENV=production.
  return 'dev-only-insecure-secret-change-me';
}

// Every protected request must carry a valid "Authorization: Bearer <jwt>" header.
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ message: 'Authentication required. Please sign in.' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = { id: decoded.id, name: decoded.name, email: decoded.email, role: decoded.role };
    return next();
  } catch (err) {
    return res.status(401).json({ message: 'Session expired or invalid. Please sign in again.' });
  }
}

function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') return next();
  return res.status(403).json({ message: 'Permission denied. Admin role required.' });
}

module.exports = { verifyToken, isAdmin, getJwtSecret };
