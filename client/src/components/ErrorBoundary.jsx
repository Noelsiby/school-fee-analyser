import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'system-ui, sans-serif', textAlign: 'center' }}>
          <h1 style={{ color: '#dc2626' }}>Oops! Something went wrong.</h1>
          <p style={{ color: '#64748b' }}>We encountered an unexpected error while loading this page.</p>
          <div style={{ marginTop: '24px' }}>
            <button 
              onClick={() => window.location.reload()}
              style={{
                background: '#1E3A8A', color: 'white', padding: '10px 20px', 
                border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600
              }}
            >
              Refresh Page
            </button>
          </div>
          {process.env.NODE_ENV !== 'production' && (
            <pre style={{ marginTop: '40px', background: '#f1f5f9', padding: '20px', borderRadius: '8px', textAlign: 'left', overflowX: 'auto', color: '#dc2626', fontSize: '0.85rem' }}>
              {this.state.error?.toString()}
            </pre>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
