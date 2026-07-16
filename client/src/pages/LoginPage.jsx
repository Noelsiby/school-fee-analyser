import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import schoolLogo from '../assets/school-logo.png';
import './LoginPage.css';

export default function LoginPage() {
  const { login, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError]       = useState('');
  const [submitting, setSubmitting] = useState(false);

  const from = location.state?.from?.pathname || null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const result = await login(email.trim(), password);

    setSubmitting(false);

    if (!result.success) {
      setError(result.error);
      return;
    }

    // If there was a protected URL they were trying to reach, go there.
    // Otherwise follow the role-based redirect from AuthContext.
    navigate(from || result.redirectPath, { replace: true });
  };

  return (
    <div className="login-root">
      {/* Background decorative blobs */}
      <div className="blob blob-1" />
      <div className="blob blob-2" />
      <div className="blob blob-3" />

      <div className="login-card">
        {/* School logo */}
        <div className="login-header">
          <div className="logo-wrap">
            <img src={schoolLogo} alt="Matha English Medium School logo" className="school-logo-img" />
          </div>
          <h1 className="school-name">Matha English Medium School</h1>
          <p className="school-tagline">Exam Manager Portal</p>
          <div className="gold-divider" />
        </div>

        {/* Login form */}
        <form className="login-form" onSubmit={handleSubmit} noValidate>
          <h2 className="form-title">Sign In</h2>
          <p className="form-subtitle">Enter your staff credentials to continue</p>

          {error && (
            <div className="error-banner" role="alert">
              <span className="error-icon">⚠</span>
              <span>{error}</span>
            </div>
          )}

          <div className="field-group">
            <label htmlFor="email" className="field-label">Email Address</label>
            <div className="input-wrapper">
              <span className="input-icon">✉</span>
              <input
                id="email"
                type="email"
                className="field-input"
                placeholder="you@matha.school"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                autoFocus
              />
            </div>
          </div>

          <div className="field-group">
            <label htmlFor="password" className="field-label">Password</label>
            <div className="input-wrapper">
              <span className="input-icon">🔒</span>
              <input
                id="password"
                type={showPass ? 'text' : 'password'}
                className="field-input"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                className="toggle-pass"
                onClick={() => setShowPass((p) => !p)}
                aria-label={showPass ? 'Hide password' : 'Show password'}
              >
                {showPass ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <button
            id="login-submit-btn"
            type="submit"
            className="login-btn"
            disabled={submitting || loading || !email || !password}
          >
            {submitting ? (
              <span className="btn-spinner" />
            ) : (
              'Sign In'
            )}
          </button>
        </form>

        <div style={{ marginTop: '24px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem', color: '#475569', textAlign: 'left', lineHeight: '1.4' }}>
          <strong>Note:</strong> Only one account can be active at a time in this browser. Logging in will sign out any other active session.
          <br /><br />
          <em>To test multiple accounts simultaneously, use different browsers or an incognito window.</em>
        </div>

        <p className="login-footer">© 2026 Matha English Medium School</p>
      </div>
    </div>
  );
}
