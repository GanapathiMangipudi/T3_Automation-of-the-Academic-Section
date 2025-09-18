// middleware/auth.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

/**
 * requireAuth - verifies Authorization: Bearer <token>
 * attaches decoded payload to req.user
 */
function requireAuth(req, res, next) {
  const auth = req.headers.authorization;

  if (!auth || !auth.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({
      error: 'missing_token',
      details: 'Authorization header must be in format: Bearer <token>'
    });
  }

  const token = auth.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // e.g. { id, username, role, iat, exp }

    if (process.env.NODE_ENV !== 'production') {
      console.log('[requireAuth] user payload:', decoded);
    }

    return next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'token_expired' });
    }
    return res.status(401).json({ error: 'invalid_token', details: err.message });
  }
}

/**
 * requireRole(...allowed) - middleware factory to require a role
 * Example: requireRole('admin') or requireRole('professor','admin')
 */
function requireRole(...allowed) {
  // normalize allowed roles to lowercase
  const normalized = allowed.map(r => r.toLowerCase());

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'missing_auth' });
    }

    const role = (req.user.role || '').toLowerCase();
    if (!role || !normalized.includes(role)) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[requireRole] forbidden for role:', role, 'allowed:', normalized);
      }
      return res.status(403).json({
        error: 'forbidden',
        details: `required role: ${allowed.join(', ')}`
      });
    }

    next();
  };
}

module.exports = { requireAuth, requireRole };
