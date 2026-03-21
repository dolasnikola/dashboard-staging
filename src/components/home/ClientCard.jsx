import { useNavigate } from 'react-router-dom'
import { dbGetCampaignData, dbGetBudget } from '../../lib/cache'
import { fmt, PLATFORM_NAMES, PLATFORM_BADGE } from '../../lib/data'

export default function ClientCard({ id, client, currentMonth, index }) {
  const navigate = useNavigate()

  let totalSpend = 0, totalBudget = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0
  client.platforms.forEach(p => {
    const rows = dbGetCampaignData(id, p, currentMonth)
    rows.forEach(r => {
      totalSpend += r.spend || 0
      totalImpressions += r.impressions || 0
      totalClicks += r.clicks || 0
      totalConversions += r.conversions || 0
    })
    totalBudget += dbGetBudget(id, p, currentMonth)
  })

  const pct = totalBudget > 0 ? (totalSpend / totalBudget * 100) : 0
  const fillClass = pct > 90 ? 'bg-gradient-to-r from-red-600 to-red-400' : pct > 70 ? 'bg-gradient-to-r from-orange-500 to-yellow-400' : 'bg-gradient-to-r from-green-600 to-green-400'
  const statusClass = client.status === 'active' ? 'status-active' : 'status-partial'

  return (
    <div
      onClick={() => navigate(`/${id}`)}
      style={{
        background: 'var(--color-card)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-default)',
        padding: 26,
        cursor: 'pointer',
        transition: 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)',
        boxShadow: 'var(--shadow-default)',
        position: 'relative',
        overflow: 'hidden',
        animation: 'cardFadeUp 0.5s ease both',
        animationDelay: `${index * 0.07}s`
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
        e.currentTarget.style.transform = 'translateY(-3px)'
        e.currentTarget.style.borderColor = 'var(--color-accent)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-default)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      {/* Top accent bar on hover - handled via CSS pseudo-element workaround */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 19, fontWeight: 400, letterSpacing: '-0.01em' }}>
          {client.name}
        </span>
        <span className={statusClass} style={{
          fontSize: 11, padding: '4px 12px', borderRadius: 20, fontWeight: 600, letterSpacing: '0.02em',
          background: client.status === 'active' ? 'var(--color-green-light)' : 'var(--color-orange-light)',
          color: client.status === 'active' ? 'var(--color-green)' : 'var(--color-orange)'
        }}>
          {client.statusLabel}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {client.platforms.map(p => (
          <span key={p} className={`platform-badge ${PLATFORM_BADGE[p]}`}>{PLATFORM_NAMES[p]}</span>
        ))}
        {client.tiktok && <span className="platform-badge badge-tiktok">TikTok</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <MiniMetric label="Spend" value={fmt(totalSpend, 'money', client.currency)} />
        <MiniMetric label="Impressions" value={fmt(totalImpressions, 'number')} />
        <MiniMetric label="Clicks" value={fmt(totalClicks, 'number')} />
        <MiniMetric label="Conversions" value={fmt(totalConversions, 'number')} />
      </div>

      {totalBudget > 0 && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontWeight: 500 }}>
            <span>Budget</span>
            <span>{fmt(totalSpend, 'money', client.currency)} / {fmt(totalBudget, 'money', client.currency)}</span>
          </div>
          <div style={{ height: 5, background: 'var(--color-bg-subtle)', borderRadius: 3, overflow: 'hidden' }}>
            <div className={fillClass} style={{ height: '100%', borderRadius: 3, width: `${Math.min(pct, 100)}%`, transition: 'width 0.6s cubic-bezier(0.22, 1, 0.36, 1)' }} />
          </div>
        </div>
      )}
    </div>
  )
}

function MiniMetric({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2, letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  )
}
