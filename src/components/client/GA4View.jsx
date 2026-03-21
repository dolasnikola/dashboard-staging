import { useState } from 'react'
import { dbGetGA4Data } from '../../lib/cache'
import { syncGA4Sheet } from '../../lib/sync'
import { useAppStore } from '../../stores/appStore'

export default function GA4View({ clientId }) {
  const notify = useAppStore(s => s.notify)
  const ga4Data = dbGetGA4Data()
  const months = Object.keys(ga4Data).sort().reverse()

  const now = new Date()
  const prevMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`

  const [selectedMonth, setSelectedMonth] = useState(months.length > 0 ? months[0] : prevMonth)
  const [refreshing, setRefreshing] = useState(false)

  const monthData = ga4Data[selectedMonth] || []
  const hasData = monthData.length > 0

  const handleRefresh = async () => {
    setRefreshing(true)
    await syncGA4Sheet(notify)
    setRefreshing(false)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <span className="campaign-type" style={{ background: '#e8f5e9', color: '#388e3c' }}>GA4 KPI</span>
        <select
          value={selectedMonth}
          onChange={e => setSelectedMonth(e.target.value)}
          style={{ padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 13 }}
        >
          {months.length > 0 ? months.map(val => {
            const [y, m] = val.split('-').map(Number)
            const label = new Date(y, m - 1).toLocaleDateString('sr-Latn', { year: 'numeric', month: 'long' })
            return <option key={val} value={val}>{label}</option>
          }) : <option value={prevMonth}>Nema podataka</option>}
        </select>
        <button className="btn" onClick={handleRefresh} style={{ fontSize: 12, padding: '8px 12px' }} disabled={refreshing}>
          {refreshing ? 'Osvežavam...' : 'Osveži iz Sheet-a'}
        </button>
      </div>

      {hasData ? (
        <div className="data-table-wrap">
          <table className="data-table" style={{ marginTop: 0 }}>
            <thead>
              <tr>
                <th>Proizvod</th>
                <th>Leads</th>
                <th>Sessions</th>
                <th>Total Users</th>
              </tr>
            </thead>
            <tbody>
              {monthData.map((r, i) => {
                const isTotal = r.product.startsWith('UKUPNO')
                return (
                  <tr key={i} style={isTotal ? { fontWeight: 700, background: 'var(--color-bg-subtle)' } : {}}>
                    <td>{r.product}</td>
                    <td>{Number(r.leads).toLocaleString('de-DE')}</td>
                    <td>{Number(r.sessions).toLocaleString('de-DE')}</td>
                    <td>{Number(r.users).toLocaleString('de-DE')}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)',
          background: 'var(--color-card)', borderRadius: 12, border: '1px solid var(--color-border)'
        }}>
          Nema podataka za izabrani mesec.
          <br /><small style={{ marginTop: 8, display: 'block' }}>Podaci se automatski unose svakog 5. u mesecu putem Apps Script trigera.</small>
        </div>
      )}
    </div>
  )
}
