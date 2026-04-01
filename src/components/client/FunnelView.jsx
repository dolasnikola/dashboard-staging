import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getFilteredData } from '../../lib/utils'
import { fmt, PLATFORM_NAMES } from '../../lib/data'
import { Bar } from 'react-chartjs-2'

const FUNNEL_STAGES = [
  { key: 'impressions', label: 'Impressions', color: '#4a6cf7' },
  { key: 'clicks', label: 'Clicks', color: '#22c55e' },
  { key: 'conversions', label: 'Conversions', color: '#f59e0b' }
]

const PLATFORM_COLORS = {
  google_ads: '#ea4335',
  meta: '#1877f2',
  dv360: '#8b5cf6',
  tiktok: '#010101'
}

export default function FunnelView({ clientId, client }) {
  const { activeDateRange, customDateFrom, customDateTo } = useAppStore()

  const { totals, byPlatform } = useMemo(() => {
    const totals = { impressions: 0, clicks: 0, conversions: 0, spend: 0 }
    const byPlatform = {}
    const adPlatforms = client.platforms.filter(p => p !== 'ga4' && p !== 'local_display')

    adPlatforms.forEach(p => {
      const rows = getFilteredData(clientId, p, activeDateRange, customDateFrom, customDateTo)
      const agg = { impressions: 0, clicks: 0, conversions: 0, spend: 0 }
      rows.forEach(r => {
        agg.impressions += r.impressions || 0
        agg.clicks += r.clicks || 0
        agg.conversions += r.conversions || 0
        agg.spend += r.spend || 0
      })
      totals.impressions += agg.impressions
      totals.clicks += agg.clicks
      totals.conversions += agg.conversions
      totals.spend += agg.spend
      byPlatform[p] = agg
    })

    return { totals, byPlatform }
  }, [clientId, client, activeDateRange, customDateFrom, customDateTo])

  if (totals.impressions === 0) return null

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100) : 0
  const convRate = totals.clicks > 0 ? (totals.conversions / totals.clicks * 100) : 0

  const platforms = Object.keys(byPlatform)

  // Stacked bar chart data: each stage broken down by platform
  const stackedData = {
    labels: FUNNEL_STAGES.map(s => s.label),
    datasets: platforms.map(p => ({
      label: PLATFORM_NAMES[p],
      data: FUNNEL_STAGES.map(s => byPlatform[p][s.key]),
      backgroundColor: PLATFORM_COLORS[p] || '#6b7280'
    }))
  }

  return (
    <div style={{ marginTop: 8, marginBottom: 24 }}>
      <h3 style={{
        fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
        marginBottom: 16, letterSpacing: '-0.01em'
      }}>
        Konverzioni levak
      </h3>

      {/* Funnel visualization */}
      <div style={{
        display: 'flex', gap: 0, alignItems: 'stretch', marginBottom: 20,
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-default)', overflow: 'hidden', boxShadow: 'var(--shadow-default)'
      }}>
        {FUNNEL_STAGES.map((stage, i) => {
          const val = totals[stage.key]
          const maxVal = totals.impressions
          const widthPct = maxVal > 0 ? Math.max((val / maxVal) * 100, 15) : 33

          return (
            <div key={stage.key} style={{
              flex: `0 0 ${widthPct}%`,
              padding: '24px 20px',
              background: `${stage.color}${i === 0 ? '12' : i === 1 ? '18' : '22'}`,
              borderRight: i < FUNNEL_STAGES.length - 1 ? '1px solid var(--color-border-light)' : 'none',
              display: 'flex', flexDirection: 'column', justifyContent: 'center',
              position: 'relative'
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: stage.color, marginBottom: 4 }}>
                {stage.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
                {fmt(val, 'number')}
              </div>
              {i > 0 && (
                <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  {i === 1 ? `CTR: ${ctr.toFixed(2)}%` : `Conv Rate: ${convRate.toFixed(2)}%`}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Stacked bar chart by platform */}
      {platforms.length > 1 && (
        <div style={{
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)'
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
            Levak po platformama
          </div>
          <div style={{ position: 'relative', height: 280 }}>
            <Bar
              data={stackedData}
              options={{
                responsive: true, maintainAspectRatio: false,
                scales: {
                  x: { stacked: true },
                  y: { stacked: true, beginAtZero: true }
                },
                plugins: { legend: { position: 'bottom' } }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
