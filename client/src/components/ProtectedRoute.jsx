import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, getRolePath } from '../contexts/AuthContext';

/**
 * ProtectedRoute — wraps routes that require authentication.
 *
 * If not authenticated → redirect to /login (preserving the
 * intended URL in location.state so we can redirect back after login).
 *
 * If allowedRoles is provided, also checks that the user's
 * ACTIVE role is in the allowed list. If not → redirect to
 * their own dashboard (not a 404/403, which could be confusing).
 */
export default function ProtectedRoute({ children, allowedRoles }) {
  const { isAuthenticated, user, activeRole } = useAuth();
  const location = useLocation();

  // Not logged in → go to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Role check
  if (allowedRoles && allowedRoles.length > 0) {
    const permitted = allowedRoles.includes(activeRole);
    if (!permitted) {
      // Redirect to their own dashboard rather than a hard 403
      const fallback = activeRole ? getRolePath(activeRole) : '/login';
      return <Navigate to={fallback} replace />;
    }
  }

  return children;
}
