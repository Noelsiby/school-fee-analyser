import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

// ─────────────────────────────────────────────────────────────
// AuthContext
//
// Token storage: in-memory React state (NOT localStorage).
// Rationale: localStorage is accessible to any JS on the page
// (XSS risk). In-memory state is cleared on tab close / refresh.
// The trade-off (user must re-login on refresh) is acceptable
// for a school admin tool used during work sessions.
//
// Auto-logout: we decode the JWT's `exp` claim and set a
// setTimeout to call logout() exactly when the token expires.
// ─────────────────────────────────────────────────────────────

const AuthContext = createContext(null);

// Decode a JWT payload without verifying signature (verification
// happens on the server; we only need the claims client-side).
function decodeJwtPayload(token) {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser]             = useState(null);
  const [activeRole, setActiveRole] = useState(() => localStorage.getItem('activeRole') || null);
  const [loading, setLoading]       = useState(true); // start true for initial check
  const [isInitialized, setIsInitialized] = useState(false);

  // ── Initial load: check if user has a valid cookie ────────────
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          // Auto-select role if they only have one and activeRole isn't set properly
          if (data.user.roles?.length === 1) {
            setActiveRole(data.user.roles[0]);
            localStorage.setItem('activeRole', data.user.roles[0]);
          } else if (data.user.roles?.length > 1 && !localStorage.getItem('activeRole')) {
            // Keep activeRole null to force role selection
          }
        } else {
            localStorage.removeItem('activeRole');
        }
      } catch (err) {
        // Ignore network errors on init
      } finally {
        setLoading(false);
        setIsInitialized(true);
      }
    }
    checkAuth();
  }, []);

  // ── Clear everything on logout ──────────────────────────────
  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      // Ignore
    }
    setUser(null);
    setActiveRole(null);
    localStorage.removeItem('activeRole');
  }, []);

  // ── login(email, password) ───────────────────────────────────
  const login = useCallback(async (email, password) => {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        return { success: false, error: data.error || 'Login failed.' };
      }

      setUser(data.user);

      // Determine redirect
      const roles = data.user.roles || [];
      if (roles.length === 0) {
        return { success: false, error: 'Your account has no roles assigned.' };
      }

      if (roles.length === 1) {
        setActiveRole(roles[0]);
        localStorage.setItem('activeRole', roles[0]);
        return { success: true, redirectPath: getRolePath(roles[0]), needsRoleSelect: false };
      }

      // If multiple roles and one is ClassTeacher, default to it
      if (roles.includes('ClassTeacher')) {
        setActiveRole('ClassTeacher');
        localStorage.setItem('activeRole', 'ClassTeacher');
        return { success: true, redirectPath: getRolePath('ClassTeacher'), needsRoleSelect: false };
      }

      // Multiple roles without ClassTeacher → let user pick
      return { success: true, redirectPath: '/role-select', needsRoleSelect: true };
    } catch (err) {
      return { success: false, error: 'Network error. Is the server running?' };
    } finally {
      setLoading(false);
    }
  }, []);

  // ── switchRole(role) — for multi-role users ─────────────────
  const switchRole = useCallback((role) => {
    if (user?.roles?.includes(role)) {
      setActiveRole(role);
      localStorage.setItem('activeRole', role);
    }
  }, [user]);

  // ── Authorisation helpers ───────────────────────────────────
  const isAuthenticated = !!user;
  const hasRole = (role) => user?.roles?.includes(role) ?? false;
  // We no longer need Authorization headers, cookies handle it
  const getAuthHeader = useCallback(() => ({}), []);

  const value = {
    user,
    activeRole,
    loading,
    isInitialized,
    isAuthenticated,
    login,
    logout,
    switchRole,
    hasRole,
    getAuthHeader,
  };

  if (!isInitialized) {
    // Show nothing (or a loader) until the initial /api/auth/me call completes
    return <div className="flex h-screen items-center justify-center text-gray-500">Loading...</div>;
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ── Role → dashboard path mapping ──────────────────────────────
export function getRolePath(role) {
  const paths = {
    Admin:          '/admin/dashboard',
    ClassTeacher:   '/class-teacher/dashboard',
    SubjectTeacher: '/subject-teacher/dashboard',
  };
  return paths[role] ?? '/';
}

// ── Hook ────────────────────────────────────────────────────────
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
