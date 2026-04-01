import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          maxWidth: 500, margin: '80px auto', padding: 40, textAlign: 'center',
          background: 'var(--color-card, #fff)', border: '1px solid var(--color-border, #e5e7eb)',
          borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
        }}>
          <div style={{ fontSize: 36, marginBottom: 16 }}>⚠️</div>
          <h2 style={{
            fontFamily: 'var(--font-display, system-ui)', fontSize: 20, fontWeight: 400,
            marginBottom: 8, letterSpacing: '-0.01em'
          }}>
            Došlo je do greške
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-secondary, #6b7280)', marginBottom: 20 }}>
            Nešto nije u redu. Pokušajte da osvežite stranicu.
          </p>
          {this.state.error && (
            <div style={{
              padding: '10px 14px', background: 'rgba(220,38,38,0.05)',
              borderRadius: 6, border: '1px solid rgba(220,38,38,0.12)',
              fontSize: 11, fontFamily: 'monospace', color: '#dc2626',
              textAlign: 'left', marginBottom: 20, wordBreak: 'break-word'
            }}>
              {this.state.error.message}
            </div>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 24px', fontSize: 13, fontWeight: 600,
              background: 'var(--color-accent, #4338ca)', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer'
            }}
          >
            Osveži stranicu
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
