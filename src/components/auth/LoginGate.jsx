import { useState } from 'react'
import { useAuthStore } from '../../stores/authStore'

export default function LoginGate() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const login = useAuthStore(s => s.login)

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Unesi email i šifru')
      return
    }
    setError('')
    try {
      await login(email, password)
    } catch {
      setError('Pogrešan email ili šifra')
      setPassword('')
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh',
      background: 'radial-gradient(ellipse at 30% 20%, rgba(67,56,202,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(124,58,237,0.04) 0%, transparent 50%), var(--color-bg)'
    }}>
      <div style={{
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 18, padding: '44px 40px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.08), 0 2px 12px rgba(0,0,0,0.04)',
        textAlign: 'center', maxWidth: 380, width: '100%', position: 'relative', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: 'linear-gradient(90deg, var(--color-accent), var(--color-purple))'
        }} />
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, marginBottom: 6 }}>
          Performance <span style={{ color: 'var(--color-accent)' }}>Dashboard</span>
        </h2>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 28 }}>
          Unesi email i šifru za pristup
        </p>
        <input
          type="email" value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          onKeyDown={e => e.key === 'Enter' && document.getElementById('loginPw')?.focus()}
          style={{
            width: '100%', padding: '11px 14px', border: '1px solid var(--color-border)',
            borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-body)', marginBottom: 10,
            outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--color-accent)'; e.target.style.boxShadow = '0 0 0 3px rgba(67,56,202,0.08)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
          autoFocus
        />
        <input
          id="loginPw" type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Šifra"
          onKeyDown={e => e.key === 'Enter' && handleLogin()}
          style={{
            width: '100%', padding: '11px 14px', border: '1px solid var(--color-border)',
            borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-body)', marginBottom: 14,
            outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
          }}
          onFocus={e => { e.target.style.borderColor = 'var(--color-accent)'; e.target.style.boxShadow = '0 0 0 3px rgba(67,56,202,0.08)' }}
          onBlur={e => { e.target.style.borderColor = 'var(--color-border)'; e.target.style.boxShadow = 'none' }}
        />
        {error && <div style={{ color: 'var(--color-red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <button onClick={handleLogin} className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: 11 }}>
          Pristupi
        </button>
      </div>
    </div>
  )
}
