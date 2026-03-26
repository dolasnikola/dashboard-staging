import { useState } from 'react'
import { sb } from '../../lib/supabase'

export default function SetPassword({ onComplete }) {
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const inputStyle = {
    width: '100%', padding: '11px 14px', border: '1px solid var(--color-border)',
    borderRadius: 8, fontSize: 14, fontFamily: 'var(--font-body)', marginBottom: 10,
    outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
  }

  const handleFocus = (e) => {
    e.target.style.borderColor = 'var(--color-accent)'
    e.target.style.boxShadow = '0 0 0 3px rgba(67,56,202,0.08)'
  }
  const handleBlur = (e) => {
    e.target.style.borderColor = 'var(--color-border)'
    e.target.style.boxShadow = 'none'
  }

  const handleSubmit = async () => {
    const trimmedName = fullName.trim()
    if (!trimmedName) {
      setError('Unesi korisničko ime')
      return
    }
    if (!password || !confirm) {
      setError('Unesi šifru u oba polja')
      return
    }
    if (password.length < 6) {
      setError('Šifra mora imati minimum 6 karaktera')
      return
    }
    if (password !== confirm) {
      setError('Šifre se ne poklapaju')
      return
    }

    setError('')
    setLoading(true)
    try {
      // Check if username already exists
      const { data: existing } = await sb
        .from('user_profiles')
        .select('id')
        .eq('full_name', trimmedName)

      if (existing && existing.length > 0) {
        // Check it's not the current user's own profile
        const { data: { user } } = await sb.auth.getUser()
        const isOwnProfile = existing.some(p => p.id === user?.id)
        if (!isOwnProfile) {
          setError('Ovo korisničko ime je već zauzeto')
          setLoading(false)
          return
        }
      }

      // Update password
      const { error: pwError } = await sb.auth.updateUser({ password })
      if (pwError) throw pwError

      // Update full_name in user_profiles
      const { data: { user } } = await sb.auth.getUser()
      if (user) {
        await sb.from('user_profiles')
          .update({ full_name: trimmedName })
          .eq('id', user.id)
      }

      onComplete()
    } catch (err) {
      setError(err.message || 'Greška pri registraciji')
    } finally {
      setLoading(false)
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
          Postavite korisničko ime i lozinku
        </p>
        <input
          type="text" value={fullName} onChange={e => setFullName(e.target.value)}
          placeholder="Korisničko ime"
          onKeyDown={e => e.key === 'Enter' && document.getElementById('newPw')?.focus()}
          style={inputStyle}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoFocus
        />
        <input
          id="newPw" type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Nova šifra"
          onKeyDown={e => e.key === 'Enter' && document.getElementById('confirmPw')?.focus()}
          style={inputStyle}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        <input
          id="confirmPw" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
          placeholder="Potvrdi šifru"
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          style={{ ...inputStyle, marginBottom: 14 }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {error && <div style={{ color: 'var(--color-red)', fontSize: 12, marginBottom: 12 }}>{error}</div>}
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="btn btn-primary"
          style={{ width: '100%', justifyContent: 'center', padding: 11, opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Čuvanje...' : 'Registruj se'}
        </button>
      </div>
    </div>
  )
}
