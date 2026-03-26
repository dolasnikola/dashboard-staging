import { useState, useMemo } from 'react'
import { dbGetAllLocalDisplay } from '../../lib/cache'
import { fmt } from '../../lib/data'

export default function LocalDisplayView({ clientId }) {
  const allRows = dbGetAllLocalDisplay(clientId)

  // Get available months
  const months = useMemo(() => {
    const set = new Set(allRows.map(r => r.month))
    return [...set].sort().reverse()
  }, [allRows])

  const [selectedMonth, setSelectedMonth] = useState(months[0] || '')

  const monthData = useMemo(() => {
    return allRows.filter(r => r.month === selectedMonth)
  }, [allRows, selectedMonth])

  // Aggregate by publisher
  const byPublisher = useMemo(() => {
    const map = {}
    monthData.forEach(r => {
      if (!map[r.publisher]) map[r.publisher] = { impressions: 0, clicks: 0, actions: 0 }
      map[r.publisher].impressions += r.impressions
      map[r.publisher].clicks += r.clicks
      map[r.publisher].actions += r.actions
    })
    // Compute CTR per publisher
    Object.values(map).forEach(v => {
      v.ctr = v.impressions > 0 ? (v.clicks / v.impressions * 100) : 0
    })
    return Object.entries(map).sort((a, b) => b[1].impressions - a[1].impressions)
  }, [monthData])

  // Totals
  const totals = useMemo(() => {
    const t = { impressions: 0, clicks: 0, actions: 0 }
    monthData.forEach(r => {
      t.impressions += r.impressions
      t.clicks += r.clicks
      t.actions += r.actions
    })
    t.ctr = t.impressions > 0 ? (t.clicks / t.impressions * 100) : 0
    return t
  }, [monthData])

  const hasData = monthData.length > 0

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <span className="campaign-type" style={{ background: '#fef3c7', color: '#b45309' }}>Local Display</span>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 }}
        >
          {months.length > 0 ? months.map(val => {
            if (!val) return null
            const parts = val.split('-')
            const y = Number(parts[0]), m = Number(parts[1])
            const label = new Date(y, m - 1).toLocaleDateString('sr-Latn', { year: 'numeric', month: 'long' })
            return <option key={val} value={val}>{label}</option>
          }) : <option value="">Nema podataka</option>}
        </select>
      </div>

      {hasData ? (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { label: 'Impressions', value: fmt(totals.impressions, 'number') },
              { label: 'Clicks', value: fmt(totals.clicks, 'number') },
              { label: 'CTR', value: totals.ctr.toFixed(2) + '%' },
              { label: 'Actions', value: fmt(totals.actions, 'number') }
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

          {/* Publisher table */}
          <div className="data-table-wrap">
            <table className="data-table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th>Publisher</th>
                  <th>Impressions</th>
                  <th>Clicks</th>
                  <th>CTR</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {byPublisher.map(([pub, data]) => (
                  <tr key={pub}>
                    <td style={{ fontWeight: 500 }}>{pub}</td>
                    <td>{fmt(data.impressions, 'number')}</td>
                    <td>{fmt(data.clicks, 'number')}</td>
                    <td>{data.ctr.toFixed(2)}%</td>
                    <td>{fmt(data.actions, 'number')}</td>
                  </tr>
                ))}
                <tr style={{ fontWeight: 700, background: 'var(--color-bg-subtle)' }}>
                  <td>Ukupno</td>
                  <td>{fmt(totals.impressions, 'number')}</td>
                  <td>{fmt(totals.clicks, 'number')}</td>
                  <td>{totals.ctr.toFixed(2)}%</td>
                  <td>{fmt(totals.actions, 'number')}</td>
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
                {monthData
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
          Nema Local Display podataka za izabrani mesec.
          <br /><small style={{ marginTop: 8, display: 'block' }}>Podaci se unose mesečno iz Gemius izveštaja.</small>
        </div>
      )}
    </div>
  )
}
