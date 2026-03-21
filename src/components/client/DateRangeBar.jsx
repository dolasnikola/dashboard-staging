import { useAppStore } from '../../stores/appStore'

const PRESETS = [
  { key: 'this_month', label: 'Trenutni mesec' },
  { key: 'last_month', label: 'Prošli mesec' },
  { key: 'yesterday', label: 'Juče' },
  { key: 'last_7', label: 'Poslednjih 7 dana' },
  { key: 'last_30', label: 'Poslednjih 30 dana' },
  { key: 'all', label: 'Ukupno' },
  { key: 'custom', label: 'Custom' },
]

export default function DateRangeBar() {
  const { activeDateRange, customDateFrom, customDateTo, setDateRange, setCustomDates } = useAppStore()

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
      {PRESETS.map(p => (
        <button
          key={p.key}
          onClick={() => setDateRange(p.key)}
          style={{
            padding: '6px 14px', borderRadius: 'var(--radius-sm)',
            border: '1px solid ' + (activeDateRange === p.key ? 'var(--color-accent)' : 'var(--color-border)'),
            background: activeDateRange === p.key ? 'var(--color-accent)' : 'var(--color-card)',
            color: activeDateRange === p.key ? 'white' : 'var(--color-text-secondary)',
            cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
            transition: 'all 0.2s ease',
            boxShadow: activeDateRange === p.key ? '0 2px 8px rgba(67, 56, 202, 0.2)' : 'none'
          }}
        >
          {p.label}
        </button>
      ))}
      {activeDateRange === 'custom' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="date" value={customDateFrom || ''}
            onChange={e => setCustomDates(e.target.value, customDateTo)}
            style={{
              padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              fontSize: 12, fontFamily: 'var(--font-body)', background: 'var(--color-card)', color: 'var(--color-text)'
            }}
          />
          <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>–</span>
          <input
            type="date" value={customDateTo || ''}
            onChange={e => setCustomDates(customDateFrom, e.target.value)}
            style={{
              padding: '6px 10px', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-sm)',
              fontSize: 12, fontFamily: 'var(--font-body)', background: 'var(--color-card)', color: 'var(--color-text)'
            }}
          />
        </div>
      )}
    </div>
  )
}
