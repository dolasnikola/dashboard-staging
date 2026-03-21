import { groupByProduct } from '../../lib/utils'
import { NLB_PRODUCTS, fmtMetric } from '../../lib/data'
import { Line } from 'react-chartjs-2'

export default function ProductsSection({ rawRows, currency }) {
  const grouped = groupByProduct(rawRows)
  if (Object.keys(grouped).length === 0) return null

  // Prepare chart data
  const allDates = new Set()
  Object.values(grouped).forEach(rows => rows.forEach(r => { if (r.date) allDates.add(r.date.substring(0, 10)) }))
  const sortedDates = [...allDates].sort()

  const datasets = Object.entries(grouped).map(([key, rows]) => {
    const info = NLB_PRODUCTS[key] || { label: 'Ostalo', color: '#94a3b8' }
    const dailyMap = {}
    rows.forEach(r => {
      const d = (r.date || '').substring(0, 10)
      if (d) dailyMap[d] = (dailyMap[d] || 0) + (r.conversions || 0)
    })
    return {
      label: info.label,
      data: sortedDates.map(d => dailyMap[d] || 0),
      borderColor: info.color,
      backgroundColor: info.color + '20',
      borderWidth: 2, tension: 0.3, fill: false, pointRadius: 3
    }
  })

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, marginBottom: 18, marginTop: 32, display: 'flex', alignItems: 'center', gap: 10 }}>
        Proizvodi
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {Object.entries(grouped).map(([key, rows]) => {
          const info = NLB_PRODUCTS[key] || { label: 'Ostalo', color: '#94a3b8' }
          const totalConv = rows.reduce((s, r) => s + (r.conversions || 0), 0)
          const totalSpend = rows.reduce((s, r) => s + (r.spend || 0), 0)
          const cpa = totalConv > 0 ? totalSpend / totalConv : 0

          return (
            <div key={key} style={{
              background: 'var(--color-card)', border: '1px solid var(--color-border)',
              borderLeft: `4px solid ${info.color}`, borderRadius: 'var(--radius-default)',
              padding: '18px', boxShadow: 'var(--shadow-default)', minWidth: 180
            }}>
              <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                {info.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: '-0.02em' }}>
                {fmtMetric('conversions', totalConv, currency)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                Spend: {fmtMetric('spend', totalSpend, currency)} · CPA: {fmtMetric('cpa', cpa, currency)}
              </div>
            </div>
          )
        })}
      </div>

      {sortedDates.length > 1 && (
        <div style={{
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)', marginBottom: 24
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
            Dnevne konverzije po proizvodu
          </div>
          <div style={{ position: 'relative', height: 280 }}>
            <Line
              data={{ labels: sortedDates, datasets }}
              options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' } },
                scales: {
                  x: { ticks: { maxRotation: 45, font: { size: 10 } } },
                  y: { beginAtZero: true, title: { display: true, text: 'Konverzije' } }
                }
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
