import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

export default function Header({ onImportClick, onBudgetClick, onSheetsClick }) {
  const { currentUserRole, logout } = useAuthStore()
  const navigate = useNavigate()
  const isViewer = currentUserRole === 'viewer'

  return (
    <div style={{
      background: 'rgba(255, 255, 255, 0.85)',
      backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--color-border-light)',
      padding: '14px 32px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      position: 'sticky', top: 0, zIndex: 100,
      boxShadow: 'inset 0 3px 0 0 var(--color-accent), 0 1px 8px rgba(0,0,0,0.04)'
    }} className="header-container">
      <h1 style={{
        fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', cursor: 'pointer'
      }} onClick={() => navigate('/')}>
        Performance <span style={{ color: 'var(--color-accent)' }}>Dashboard</span>
      </h1>
      <div style={{ display: 'flex', gap: 8 }}>
        {currentUserRole === 'admin' && (
          <button className="btn" onClick={() => navigate('/admin')}>Admin</button>
        )}
        {!isViewer && (
          <>
            <button className="btn" onClick={onSheetsClick}>Sheets Sync</button>
            <button className="btn" onClick={onBudgetClick}>Budget</button>
            <button className="btn btn-primary" onClick={onImportClick}>Import CSV</button>
          </>
        )}
        <button className="btn" onClick={logout} style={{ marginLeft: 8, color: 'var(--color-text-secondary)' }}>
          Odjavi se
        </button>
      </div>
    </div>
  )
}
