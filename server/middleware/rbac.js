/**
 * Role-Based Access Control (RBAC) Middleware
 *
 * Requires the `authenticate` middleware to run first (req.user must be set).
 *
 * Usage:
 *   router.delete('/exam/:id', authenticate, requireRole('Admin'), deleteExam);
 *   router.patch('/marks/:id', authenticate, requireRole('SubjectTeacher', 'ClassTeacher'), updateMark);
 *
 * @param  {...string} allowedRoles - One or more roles from the Role enum
 * @returns Express middleware that allows or rejects the request
 */
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthenticated' });
    }

    const userRoles = req.user.roles || [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Requires one of: ${allowedRoles.join(', ')}`,
      });
    }

    next();
  };
};

module.exports = { requireRole };
