import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getFilteredData } from '../../lib/utils'
import { fmt } from '../../lib/data'

const FUNNEL_STAGES = [
  { key: 'impressions', label: 'Impressions', color: '#4a6cf7' },
  { key: 'clicks', label: 'Klikovi', color: '#22c55e' },
  { key: 'conversions', label: 'Konverzije', color: '#f59e0b' }
]

export default function FunnelView({ clientId, client }) {
  const { activeDateRange, customDateFrom, customDateTo } = useAppStore()

  const totals = useMemo(() => {
    const totals = { impressions: 0, clicks: 0, conversions: 0 }
    const adPlatforms = client.platforms.filter(p => p !== 'ga4' && p !== 'local_display')

    adPlatforms.forEach(p => {
      const rows = getFilteredData(clientId, p, activeDateRange, customDateFrom, customDateTo)
      rows.forEach(r => {
        totals.impressions += r.impressions || 0
        totals.clicks += r.clicks || 0
        totals.conversions += r.conversions || 0
      })
    })

    return totals
  }, [clientId, client, activeDateRange, customDateFrom, customDateTo])

  if (totals.impressions === 0) return null

  const ctr = totals.impressions > 0 ? (totals.clicks / totals.impressions * 100) : 0
  const convRate = totals.clicks > 0 ? (totals.conversions / totals.clicks * 100) : 0

  return (
    <div style={{ marginTop: 8, marginBottom: 24 }}>
      <h3 style={{
        fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
        marginBottom: 16, letterSpacing: '-0.01em'
      }}>
        Konverzioni levak
      </h3>

      <div style={{
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-default)', padding: '28px 32px', boxShadow: 'var(--shadow-default)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
      }}>
        {FUNNEL_STAGES.map((stage, i) => {
          const val = totals[stage.key]
          const maxVal = totals.impressions
          // Width: proportional to value, min 20% so conversions are always visible
          const widthPct = maxVal > 0 ? Math.max((val / maxVal) * 100, 20) : 33

          return (
            <div key={stage.key} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {/* Rate label between stages */}
              {i > 0 && (
                <div style={{
                  fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)',
                  marginBottom: 6, letterSpacing: '0.02em'
                }}>
                  {i === 1 ? `CTR: ${ctr.toFixed(2)}%` : `Conv. Rate: ${convRate.toFixed(2)}%`}
                </div>
              )}
              {/* Funnel bar */}
              <div style={{
                width: `${widthPct}%`,
                padding: '16px 24px',
                background: `${stage.color}14`,
                border: `1px solid ${stage.color}30`,
                borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                transition: 'width 0.3s ease'
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: stage.color }}>
                  {stage.label}
                </div>
                <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
                  {fmt(val, 'number')}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
