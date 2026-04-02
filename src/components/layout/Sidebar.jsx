import { useLocation, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import AlertBell from '../ui/AlertBell'
import SyncStatusIndicator from '../ui/SyncStatusIndicator'

export default function Sidebar({ onImportClick, onBudgetClick, mobileOpen, onMobileClose }) {
  const { currentUser, currentUserRole, logout } = useAuthStore()
  const location = useLocation()
  const navigate = useNavigate()
  const isViewer = currentUserRole === 'viewer'

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/' || (location.pathname !== '/admin' && location.pathname.length > 1)
    return location.pathname === path
  }

  const handleNav = (path) => {
    navigate(path)
    if (onMobileClose) onMobileClose()
  }

  return (
    <aside className={`sidebar${mobileOpen ? ' open' : ''}`}>
      {/* Logo */}
      <div
        onClick={() => handleNav('/')}
        style={{
          padding: '4px 14px 20px',
          cursor: 'pointer',
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 400,
          color: 'var(--color-sidebar-text-active)',
          letterSpacing: '-0.01em'
        }}
      >
        Performance{' '}
        <span style={{ color: '#a5b4fc' }}>Dashboard</span>
      </div>

      {/* Main nav */}
      <div style={{ marginBottom: 4 }}>
        <div className="sidebar-section-label">Navigacija</div>
        <button
          className={`sidebar-nav-item${isActive('/') ? ' active' : ''}`}
          onClick={() => handleNav('/')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
          </svg>
          Klijenti
        </button>

        {currentUserRole === 'admin' && (
          <button
            className={`sidebar-nav-item${isActive('/admin') ? ' active' : ''}`}
            onClick={() => handleNav('/admin')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Admin panel
          </button>
        )}
      </div>

      <div className="sidebar-divider" />

      {/* Utility */}
      <div style={{ marginBottom: 4 }}>
        <div className="sidebar-section-label">Status</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px' }}>
          <SyncStatusIndicator />
          <span style={{ fontSize: 12 }}>Sync status</span>
        </div>
        <div style={{ padding: '4px 6px' }}>
          <AlertBell />
        </div>
      </div>

      <div className="sidebar-divider" />

      {/* Actions */}
      {!isViewer && (
        <>
          <div style={{ marginBottom: 4 }}>
            <div className="sidebar-section-label">Akcije</div>
            <button className="sidebar-nav-item" onClick={onBudgetClick}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Budget
            </button>
            <button className="sidebar-nav-item" onClick={onImportClick}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Import CSV
            </button>
          </div>
          <div className="sidebar-divider" />
        </>
      )}

      {/* User + Logout — pushed to bottom */}
      <div style={{ marginTop: 'auto', padding: '8px 6px' }}>
        <div style={{
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          padding: '0 8px 8px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap'
        }}>
          {currentUser?.email}
        </div>
        <button
          className="sidebar-nav-item"
          onClick={logout}
          style={{ color: 'rgba(255,255,255,0.5)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          Odjavi se
        </button>
      </div>
    </aside>
  )
}
