import { useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { useAppStore } from '../../stores/appStore'
import { dbGetAllLocalDisplay, dbGetAllLocalDisplayDaily } from '../../lib/cache'
import { getDateRangeBounds } from '../../lib/utils'
import { fmt } from '../../lib/data'

export default function LocalDisplayView({ clientId }) {
  const { activeDateRange, customDateFrom, customDateTo } = useAppStore()
  const monthlyRows = dbGetAllLocalDisplay(clientId)
  const dailyRows = dbGetAllLocalDisplayDaily(clientId)
  const hasDailyData = dailyRows.length > 0

  // Filter data by global date range
  const filteredData = useMemo(() => {
    if (hasDailyData) {
      const bounds = getDateRangeBounds(activeDateRange, customDateFrom, customDateTo)
      const fromStr = bounds.from.toISOString().slice(0, 10)
      const toStr = bounds.to.toISOString().slice(0, 10)
      return dailyRows.filter(r => r.date >= fromStr && r.date <= toStr)
    }
    // Monthly fallback: filter by months in range
    const bounds = getDateRangeBounds(activeDateRange, customDateFrom, customDateTo)
    if (bounds.allMonths) return monthlyRows
    if (bounds.month) return monthlyRows.filter(r => r.month === bounds.month)
    // Multi-month range: compute months
    const fromMonth = bounds.from.toISOString().slice(0, 7)
    const toMonth = bounds.to.toISOString().slice(0, 7)
    return monthlyRows.filter(r => r.month >= fromMonth && r.month <= toMonth)
  }, [hasDailyData, dailyRows, monthlyRows, activeDateRange, customDateFrom, customDateTo])

  // Aggregate by publisher
  const byPublisher = useMemo(() => {
    const map = {}
    filteredData.forEach(r => {
      if (!map[r.publisher]) map[r.publisher] = { impressions: 0, clicks: 0, actions: 0 }
      map[r.publisher].impressions += r.impressions
      map[r.publisher].clicks += r.clicks
      map[r.publisher].actions += r.actions
    })
    Object.values(map).forEach(v => {
      v.ctr = v.impressions > 0 ? (v.clicks / v.impressions * 100) : 0
    })
    return Object.entries(map).sort((a, b) => b[1].impressions - a[1].impressions)
  }, [filteredData])

  // Totals
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, actions: 0 }
    filteredData.forEach(r => {
      t.impressions += r.impressions
      t.clicks += r.clicks
      t.actions += r.actions
    })
    t.ctr = t.impressions > 0 ? (t.clicks / t.impressions * 100) : 0
    return t
  }, [filteredData])

  // Daily trend data (only for daily data)
  const dailyTrend = useMemo(() => {
    if (!hasDailyData) return null
    const byDay = {}
    filteredData.forEach(r => {
      if (!r.date) return
      if (!byDay[r.date]) byDay[r.date] = { impressions: 0, clicks: 0 }
      byDay[r.date].impressions += r.impressions
      byDay[r.date].clicks += r.clicks
    })
    const sorted = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))
    if (sorted.length < 2) return null
    return {
      labels: sorted.map(([d]) => {
        const dt = new Date(d + 'T00:00:00')
        return dt.toLocaleDateString('sr-Latn', { day: 'numeric', month: 'short' })
      }),
      impressions: sorted.map(([, v]) => v.impressions),
      clicks: sorted.map(([, v]) => v.clicks)
    }
  }, [filteredData, hasDailyData])

  const hasData = filteredData.length > 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <span className="campaign-type" style={{ background: '#fef3c7', color: '#b45309' }}>Local Display</span>
        {hasDailyData && (
          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', background: 'var(--color-bg-subtle)', padding: '3px 8px', borderRadius: 6 }}>
            Dnevni podaci (gDE API)
          </span>
        )}
      </div>

      {hasData ? (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Impressions', value: fmt(totals.impressions, 'number') },
              { label: 'Clicks', value: fmt(totals.clicks, 'number') },
              { label: 'CTR', value: totals.ctr.toFixed(2) + '%' }
            ].map(card => (
              <div key={card.label} style={{
                background: 'var(--color-card)', borderRadius: 12, padding: '20px 24px',
                border: '1px solid var(--color-border)', boxShadow: 'var(--shadow-default)'
              }}>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>{card.label}</div>
                <div style={{ fontSize: 22, fontWeight: 600, fontFamily: 'var(--font-display)' }}>{card.value}</div>
              </div>
            ))}
          </div>

          {/* Daily trend chart (only when daily data exists) */}
          {dailyTrend && (
            <div style={{
              background: 'var(--color-card)', borderRadius: 12, padding: 20,
              border: '1px solid var(--color-border)', marginBottom: 24
            }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 16, marginTop: 0 }}>Dnevni trend</h3>
              <div style={{ height: 220 }}>
                <Line
                  data={{
                    labels: dailyTrend.labels,
                    datasets: [
                      {
                        label: 'Impressions',
                        data: dailyTrend.impressions,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59,130,246,0.1)',
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'y'
                      },
                      {
                        label: 'Clicks',
                        data: dailyTrend.clicks,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16,185,129,0.1)',
                        fill: true,
                        tension: 0.3,
                        yAxisID: 'y1'
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: { legend: { position: 'top', labels: { usePointStyle: true, pointStyle: 'circle' } } },
                    scales: {
                      y: { type: 'linear', position: 'left', title: { display: true, text: 'Impressions' }, grid: { color: 'rgba(0,0,0,0.06)' } },
                      y1: { type: 'linear', position: 'right', title: { display: true, text: 'Clicks' }, grid: { drawOnChartArea: false } }
                    }
                  }}
                />
              </div>
            </div>
          )}

          {/* Publisher table */}
          <div className="data-table-wrap">
            <table className="data-table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>Publisher</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>CTR</th>
                </tr>
              </thead>
              <tbody>
                {byPublisher.map(([pub, data]) => (
                  <tr key={pub}>
                    <td style={{ fontWeight: 500 }}>{pub}</td>
                    <td>{fmt(data.impressions, 'number')}</td>
                    <td>{fmt(data.clicks, 'number')}</td>
                    <td>{data.ctr.toFixed(2)}%</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: 'var(--color-bg-subtle)' }}>
                  <td>Ukupno</td>
                  <td>{fmt(totals.impressions, 'number')}</td>
                  <td>{fmt(totals.clicks, 'number')}</td>
                  <td>{totals.ctr.toFixed(2)}%</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Placement detail table */}
          <h3 style={{ fontSize: 15, fontWeight: 600, marginTop: 28, marginBottom: 12 }}>Detalji po placement-u</h3>
          <div className="data-table-wrap">
            <table className="data-table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>Kampanja</th>
                  <th>Publisher</th>
                  <th>Format</th>
                  <th>Tip</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>CTR</th>
                </tr>
              </thead>
              <tbody>
                {aggregateDailyByPlacement(filteredData)
                  .sort((a, b) => b.impressions - a.impressions)
                  .map((r, i) => (
                    <tr key={i}>
                      <td>{r.campaign}</td>
                      <td>{r.publisher}</td>
                      <td>{r.format || '—'}</td>
                      <td>{r.type || '—'}</td>
                      <td>{fmt(r.impressions, 'number')}</td>
                      <td>{fmt(r.clicks, 'number')}</td>
                      <td>{r.ctr.toFixed(2)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)',
          background: 'var(--color-card)', borderRadius: 12, border: '1px solid var(--color-border)'
        }}>
          Nema Local Display podataka za izabrani period.
          <br /><small style={{ marginTop: 8, display: 'block' }}>Podaci se sinhronizuju dnevno iz Gemius gDE API-ja.</small>
        </div>
      )}
    </div>
  )
}

/**
 * Aggregate rows into placement-level summary for the detail table.
 * Groups by campaign+publisher+format+type.
 */
function aggregateDailyByPlacement(rows) {
  const map = {}
  rows.forEach(r => {
    const key = `${r.campaign}|${r.publisher}|${r.format}|${r.type}`
    if (!map[key]) {
      map[key] = { campaign: r.campaign, publisher: r.publisher, format: r.format, type: r.type, impressions: 0, clicks: 0, actions: 0 }
    }
    map[key].impressions += r.impressions
    map[key].clicks += r.clicks
    map[key].actions += r.actions
  })
  return Object.values(map).map(r => ({
    ...r,
    ctr: r.impressions > 0 ? (r.clicks / r.impressions * 100) : 0
  }))
}
