import { useState } from 'react'
import Sidebar from './Sidebar'

export default function Layout({ children, onImportClick, onBudgetClick }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <>
      {/* Mobile header — outside flex layout so it stacks on top */}
      <div className="mobile-header">
        <button
          onClick={() => setMobileOpen(true)}
          style={{
            background: 'none', border: 'none', color: 'inherit',
            cursor: 'pointer', padding: 4, display: 'flex'
          }}
          aria-label="Otvori meni"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>
          Performance <span style={{ color: '#a5b4fc' }}>Dashboard</span>
        </span>
        <div style={{ width: 22 }} />
      </div>

      {/* Mobile overlay */}
      <div
        className={`sidebar-overlay${mobileOpen ? ' open' : ''}`}
        onClick={() => setMobileOpen(false)}
      />

      <div className="app-layout">
        <Sidebar
          onImportClick={onImportClick}
          onBudgetClick={onBudgetClick}
          mobileOpen={mobileOpen}
          onMobileClose={() => setMobileOpen(false)}
        />

        <main className="main-content">
          {children}
        </main>
      </div>
    </>
  )
}
