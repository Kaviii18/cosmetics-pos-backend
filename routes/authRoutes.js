const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, isAdmin } = require('../middleware/authMiddleware');

// Staff accounts can only be created by a signed-in admin, unless the owner explicitly
// turns on public sign-up with ALLOW_PUBLIC_REGISTRATION=true (new accounts are always cashiers).
function registrationGuard(req, res, next) {
  if (process.env.ALLOW_PUBLIC_REGISTRATION === 'true') return next();
  return verifyToken(req, res, (err) => (err ? next(err) : isAdmin(req, res, next)));
}

router.post('/register', registrationGuard, authController.register);
router.post('/login', authController.login);
router.get('/me', verifyToken, authController.getMe);

module.exports = router;
