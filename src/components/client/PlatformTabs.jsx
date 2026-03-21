import { PLATFORM_NAMES } from '../../lib/data'

export default function PlatformTabs({ platforms, activePlatform, defaultPlatform, onSwitch }) {
  const allTabs = ['overview', ...platforms]

  return (
    <div style={{
      display: 'flex', gap: 3, marginBottom: 24,
      background: 'var(--color-card)', padding: 4, borderRadius: 10,
      border: '1px solid var(--color-border)', width: 'fit-content',
      boxShadow: 'var(--shadow-default)'
    }}>
      {allTabs.map(p => {
        const label = p === 'overview' ? 'Overview' : PLATFORM_NAMES[p]
        const isActive = p === activePlatform
        return (
          <button
            key={p}
            onClick={() => onSwitch(p)}
            style={{
              padding: '8px 20px', borderRadius: 7, border: 'none',
              background: isActive ? 'var(--color-accent)' : 'none',
              color: isActive ? 'white' : 'var(--color-text-secondary)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
              fontSize: 13, fontWeight: 500, transition: 'all 0.2s ease',
              boxShadow: isActive ? '0 2px 8px rgba(67, 56, 202, 0.2)' : 'none'
            }}
          >
            {label}
          </button>
        )
      })}
    </div>
  )
}
