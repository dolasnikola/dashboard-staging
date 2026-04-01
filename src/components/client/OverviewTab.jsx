import { useMemo } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getFilteredData } from '../../lib/utils'
import { fmt, PLATFORM_NAMES } from '../../lib/data'
import { Doughnut, Bar } from 'react-chartjs-2'
import FunnelView from './FunnelView'
import PlatformComparison from './PlatformComparison'

export default function OverviewTab({ clientId, client }) {
  const { activeDateRange, customDateFrom, customDateTo } = useAppStore()

  const { metrics, pieLabels, pieData, barClicks, barImpressions } = useMemo(() => {
    let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalConvValue = 0, totalReach = 0
    const platformSpends = {}
    const barClicks = [], barImpressions = []

    client.platforms.forEach(p => {
      const rows = getFilteredData(clientId, p, activeDateRange, customDateFrom, customDateTo)
      let pSpend = 0, pClicks = 0, pImpressions = 0
      rows.forEach(r => {
        totalSpend += r.spend || 0
        totalImpressions += r.impressions || 0
        totalClicks += r.clicks || 0
        totalConversions += r.conversions || 0
        totalConvValue += r.conv_value || 0
        totalReach += r.reach || 0
        pSpend += r.spend || 0
        pClicks += r.clicks || 0
        pImpressions += r.impressions || 0
      })
      platformSpends[p] = pSpend
      barClicks.push(pClicks)
      barImpressions.push(pImpressions)
    })

    const overallCTR = totalImpressions > 0 ? (totalClicks / totalImpressions * 100) : 0
    const overallCPM = totalImpressions > 0 ? (totalSpend / totalImpressions * 1000) : 0

    const pieLabels = Object.keys(platformSpends).map(p => PLATFORM_NAMES[p])
    const pieData = Object.values(platformSpends)

    const metrics = [
      { label: 'Total Spend', value: fmt(totalSpend, 'money2', client.currency) },
      { label: 'Impressions', value: fmt(totalImpressions, 'number') },
      { label: 'Clicks', value: fmt(totalClicks, 'number') },
      { label: 'Reach', value: fmt(totalReach, 'number') },
      { label: 'CTR', value: overallCTR.toFixed(2) + '%' },
      { label: 'CPM', value: fmt(overallCPM, 'money2', client.currency) },
    ]

    return { metrics, pieLabels, pieData, barClicks, barImpressions }
  }, [clientId, client, activeDateRange, customDateFrom, customDateTo])

  const pieColors = ['#ea4335', '#1877f2', '#8b5cf6', '#010101']

  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
        gap: 16, marginBottom: 24
      }}>
        {metrics.map((m, i) => (
          <div key={m.label} style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderLeft: '3px solid var(--color-accent)', borderRadius: 'var(--radius-default)',
            padding: '18px 18px 18px 16px', boxShadow: 'var(--shadow-default)',
            animation: 'cardFadeUp 0.4s ease both', animationDelay: `${i * 0.05}s`
          }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: '-0.02em' }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      <FunnelView clientId={clientId} client={client} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        {pieData.some(v => v > 0) && (
          <div style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)'
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
              Raspodela budžeta po platformama
            </div>
            <div style={{ position: 'relative', height: 280 }}>
              <Doughnut
                data={{ labels: pieLabels, datasets: [{ data: pieData, backgroundColor: pieColors, borderWidth: 0 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }}
              />
            </div>
          </div>
        )}

        {(barClicks.some(v => v > 0) || barImpressions.some(v => v > 0)) && (
          <div style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)'
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
              Performanse po platformama
            </div>
            <div style={{ position: 'relative', height: 280 }}>
              <Bar
                data={{
                  labels: pieLabels,
                  datasets: [
                    { label: 'Clicks', data: barClicks, backgroundColor: '#4a6cf7' },
                    { label: 'Impressions', data: barImpressions, backgroundColor: '#e8e5e0', yAxisID: 'y1' }
                  ]
                }}
                options={{
                  responsive: true, maintainAspectRatio: false,
                  scales: {
                    y: { beginAtZero: true, position: 'left' },
                    y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false } }
                  },
                  plugins: { legend: { position: 'bottom' } }
                }}
              />
            </div>
          </div>
        )}
      </div>
      <PlatformComparison clientId={clientId} client={client} />
    </div>
  )
}
