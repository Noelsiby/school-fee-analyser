const jwt = require('jsonwebtoken');

/**
 * authenticate — JWT verification middleware.
 *
 * Reads the Bearer token from the Authorization header,
 * verifies it against JWT_SECRET, and attaches the decoded
 * payload to req.user: { userId, name, email, roles, iat, exp }
 *
 * Usage:
 *   router.get('/protected', authenticate, handler);
 */
const authenticate = (req, res, next) => {
  let token = req.cookies?.token;
  
  if (!token) {
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, name, email, roles, iat, exp }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

/**
 * authorize(...allowedRoles) — Role-based access control middleware.
 *
 * Must be used AFTER authenticate (requires req.user to be set).
 * Allows through if the user holds ANY of the specified roles.
 *
 * Usage:
 *   router.delete('/exam/:id', authenticate, authorize('Admin'), handler);
 *   router.patch('/marks/:id', authenticate, authorize('SubjectTeacher', 'ClassTeacher'), handler);
 *
 * @param {...string} allowedRoles - Role enum values from schema.prisma
 */
const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    const userRoles = req.user.roles || [];
    const hasPermission = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasPermission) {
      return res.status(403).json({
        error: 'Access denied.',
        required: allowedRoles,
        yourRoles: userRoles,
      });
    }

    next();
  };
};

module.exports = { authenticate, authorize };
