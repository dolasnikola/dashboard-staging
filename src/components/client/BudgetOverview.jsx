import { useAppStore } from '../../stores/appStore'
import { dbGetBudget } from '../../lib/cache'
import { getFilteredData, getDateRangeBounds, getCurrentMonth } from '../../lib/utils'
import { fmt, PLATFORM_NAMES } from '../../lib/data'
import { calcPacing, PACING_STYLES } from '../../lib/pacing'

export default function BudgetOverview({ clientId, client }) {
  const { activeDateRange, customDateFrom, customDateTo } = useAppStore()
  const bounds = getDateRangeBounds(activeDateRange, customDateFrom, customDateTo)
  const month = bounds.month || getCurrentMonth()
  const showPacing = activeDateRange === 'this_month'

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
      gap: 16, marginBottom: 24
    }}>
      {client.platforms.filter(p => p !== 'ga4' && p !== 'local_display').map(p => {
        const budget = dbGetBudget(clientId, p, month)
        const rows = getFilteredData(clientId, p, activeDateRange, customDateFrom, customDateTo)
        const spent = rows.reduce((s, r) => s + (r.spend || 0), 0)
        const pct = budget > 0 ? (spent / budget * 100) : 0
        const fillClass = pct > 90 ? 'from-red-600 to-red-400' : pct > 70 ? 'from-orange-500 to-yellow-400' : 'from-green-600 to-green-400'
        const alertMsg = pct > 95 ? '⚠ Budžet je skoro potrošen!' : pct > 85 ? '⚡ Budžet se bliži limitu' : ''

        const pacing = showPacing ? calcPacing(clientId, p, month, spent) : null
        const ps = pacing ? PACING_STYLES[pacing.status] : null

        return (
          <div key={p} style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderLeft: '3px solid var(--color-accent)', borderRadius: 'var(--radius-default)',
            padding: '18px 18px 18px 16px', boxShadow: 'var(--shadow-default)',
            animation: 'cardFadeUp 0.4s ease both'
          }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {PLATFORM_NAMES[p]} Budget
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 6, letterSpacing: '-0.02em' }}>
              {fmt(spent, 'money2', client.currency)}
            </div>
            {budget > 0 ? (
              <>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontWeight: 500 }}>
                    <span>{pct.toFixed(0)}%</span>
                    <span>{fmt(budget, 'money', client.currency)}</span>
                  </div>
                  <div style={{ height: 5, background: 'var(--color-bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
                    <div className={`bg-gradient-to-r ${fillClass}`} style={{ height: '100%', borderRadius: 3, width: `${Math.min(pct, 100)}%`, transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }} />
                  </div>
                </div>
                {pacing && pacing.status !== 'no_data' && (
                  <div style={{
                    marginTop: 8, padding: '5px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)',
                    background: ps.bg, color: ps.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6
                  }}>
                    <span style={{ fontWeight: 600 }}>
                      {ps.icon} {pacing.label}
                    </span>
                    <span style={{ opacity: 0.85, fontSize: 10 }}>
                      {(pacing.pacingRatio * 100).toFixed(0)}% tempa
                      ({pacing.daysPassed}/{pacing.daysTotal} dana)
                    </span>
                  </div>
                )}
                {alertMsg && (
                  <div style={{
                    marginTop: 8, padding: '6px 10px', fontSize: 11, borderRadius: 'var(--radius-sm)',
                    background: pct > 95 ? 'var(--color-red-light)' : 'var(--color-orange-light)',
                    color: pct > 95 ? 'var(--color-red)' : '#92400e',
                    display: 'flex', alignItems: 'center', gap: 8
                  }}>
                    {alertMsg}
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>Budžet nije podešen</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
