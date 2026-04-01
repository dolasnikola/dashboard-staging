import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getFilteredData } from '../../lib/utils'
import { fmt, PLATFORM_NAMES } from '../../lib/data'
import { Bar } from 'react-chartjs-2'

const COMPARE_METRICS = [
  { key: 'spend', label: 'Spend', type: 'money2' },
  { key: 'impressions', label: 'Impressions', type: 'number' },
  { key: 'clicks', label: 'Clicks', type: 'number' },
  { key: 'conversions', label: 'Conversions', type: 'number' },
  { key: 'ctr', label: 'CTR', type: 'percent_raw', unit: '%' },
  { key: 'cpm', label: 'CPM', type: 'money2' },
  { key: 'cpc', label: 'CPC', type: 'money2' },
  { key: 'cpa', label: 'CPA', type: 'money2' }
]

const PLATFORM_COLORS = {
  google_ads: '#ea4335',
  meta: '#1877f2',
  dv360: '#8b5cf6',
  tiktok: '#010101'
}

export default function PlatformComparison({ clientId, client }) {
  const { activeDateRange, customDateFrom, customDateTo } = useAppStore()

  const platformData = useMemo(() => {
    const data = {}
    const adPlatforms = client.platforms.filter(p => p !== 'ga4' && p !== 'local_display')

    adPlatforms.forEach(p => {
      const rows = getFilteredData(clientId, p, activeDateRange, customDateFrom, customDateTo)
      const agg = { impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0, conv_value: 0 }
      rows.forEach(r => {
        agg.impressions += r.impressions || 0
        agg.clicks += r.clicks || 0
        agg.spend += r.spend || 0
        agg.reach += r.reach || 0
        agg.conversions += r.conversions || 0
        agg.conv_value += r.conv_value || 0
      })
      agg.ctr = agg.impressions > 0 ? (agg.clicks / agg.impressions * 100) : 0
      agg.cpm = agg.impressions > 0 ? (agg.spend / agg.impressions * 1000) : 0
      agg.cpc = agg.clicks > 0 ? (agg.spend / agg.clicks) : 0
      agg.cpa = agg.conversions > 0 ? (agg.spend / agg.conversions) : 0
      data[p] = agg
    })

    return data
  }, [clientId, client, activeDateRange, customDateFrom, customDateTo])

  const platforms = Object.keys(platformData)
  if (platforms.length < 2) return null

  // Find best performer per metric
  const rankings = {}
  COMPARE_METRICS.forEach(m => {
    const invertedMetrics = ['cpm', 'cpc', 'cpa']
    let bestPlatform = null
    let bestValue = invertedMetrics.includes(m.key) ? Infinity : -Infinity

    platforms.forEach(p => {
      const val = platformData[p][m.key]
      if (val === 0) return
      if (invertedMetrics.includes(m.key)) {
        if (val < bestValue) { bestValue = val; bestPlatform = p }
      } else {
        if (val > bestValue) { bestValue = val; bestPlatform = p }
      }
    })
    rankings[m.key] = bestPlatform
  })

  const labels = platforms.map(p => PLATFORM_NAMES[p])
  const colors = platforms.map(p => PLATFORM_COLORS[p] || '#6b7280')

  // Efficiency chart: CPC + CPA side by side
  const efficiencyData = {
    labels,
    datasets: [
      { label: 'CPC', data: platforms.map(p => platformData[p].cpc), backgroundColor: '#4a6cf7' },
      { label: 'CPA', data: platforms.map(p => platformData[p].cpa), backgroundColor: '#f59e0b' }
    ]
  }

  return (
    <div style={{ marginTop: 8 }}>
      <h3 style={{
        fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400,
        marginBottom: 16, letterSpacing: '-0.01em'
      }}>
        Poređenje platformi
      </h3>

      {/* Comparison Table */}
      <div style={{
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-default)', boxShadow: 'var(--shadow-default)',
        overflow: 'auto', marginBottom: 20
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)' }}>
                Metrika
              </th>
              {platforms.map(p => (
                <th key={p} style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <span style={{ color: PLATFORM_COLORS[p] || 'var(--color-text)' }}>{PLATFORM_NAMES[p]}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE_METRICS.map(m => (
              <tr key={m.key} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                <td style={{ padding: '10px 16px', fontWeight: 500, color: 'var(--color-text-secondary)' }}>{m.label}</td>
                {platforms.map(p => {
                  const val = platformData[p][m.key]
                  const isBest = rankings[m.key] === p
                  return (
                    <td key={p} style={{
                      padding: '10px 16px', textAlign: 'right',
                      fontWeight: isBest ? 700 : 400,
                      color: isBest ? '#16a34a' : 'var(--color-text)',
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {m.type === 'percent_raw' ? val.toFixed(2) + '%' : fmt(val, m.type, client.currency)}
                      {isBest && ' ★'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Efficiency Chart */}
      <div style={{
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)'
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
          Efikasnost po platformama (CPC & CPA)
        </div>
        <div style={{ position: 'relative', height: 280 }}>
          <Bar
            data={efficiencyData}
            options={{
              responsive: true, maintainAspectRatio: false,
              scales: { y: { beginAtZero: true } },
              plugins: { legend: { position: 'bottom' } }
            }}
          />
        </div>
      </div>
    </div>
  )
}
