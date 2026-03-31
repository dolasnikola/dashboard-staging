import { useState, useEffect, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { useAppStore } from '../../stores/appStore'
import { Bar } from 'react-chartjs-2'

export default function MonitoringPanel() {
  const { clients } = useAppStore()
  const [syncLogs, setSyncLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSyncLogs()
  }, [])

  const loadSyncLogs = async () => {
    setLoading(true)
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data, error } = await sb
      .from('sync_log')
      .select('*')
      .gte('started_at', sevenDaysAgo.toISOString())
      .order('started_at', { ascending: false })
      .limit(200)

    if (error) {
      console.error('[MonitoringPanel] sync_log error:', error.message)
      setSyncLogs([])
    } else {
      setSyncLogs(data || [])
    }
    setLoading(false)
  }

  const stats = useMemo(() => {
    if (syncLogs.length === 0) return null

    const total = syncLogs.length
    const successful = syncLogs.filter(l => l.status === 'success').length
    const failed = syncLogs.filter(l => l.status === 'error' || l.status === 'failed').length
    const successRate = total > 0 ? (successful / total * 100) : 0

    // Group by source
    const bySource = {}
    syncLogs.forEach(l => {
      const src = l.source || l.function_name || 'unknown'
      if (!bySource[src]) bySource[src] = { total: 0, success: 0, failed: 0 }
      bySource[src].total++
      if (l.status === 'success') bySource[src].success++
      if (l.status === 'error' || l.status === 'failed') bySource[src].failed++
    })

    // Group by day for chart
    const byDay = {}
    syncLogs.forEach(l => {
      const day = (l.started_at || '').substring(0, 10)
      if (!day) return
      if (!byDay[day]) byDay[day] = { success: 0, failed: 0 }
      if (l.status === 'success') byDay[day].success++
      else byDay[day].failed++
    })

    const sortedDays = Object.keys(byDay).sort()

    // Average duration
    const durations = syncLogs
      .filter(l => l.started_at && l.ended_at)
      .map(l => (new Date(l.ended_at) - new Date(l.started_at)) / 1000)
    const avgDuration = durations.length > 0 ? durations.reduce((a, b) => a + b, 0) / durations.length : 0

    // Failed syncs
    const failedLogs = syncLogs.filter(l => l.status === 'error' || l.status === 'failed')

    // Data freshness per client
    const freshness = {}
    const clientIds = Object.keys(clients)
    clientIds.forEach(cid => {
      const clientLogs = syncLogs.filter(l =>
        l.client_id === cid && l.status === 'success'
      )
      if (clientLogs.length > 0) {
        freshness[cid] = clientLogs[0].started_at
      }
    })

    return { total, successful, failed, successRate, bySource, byDay, sortedDays, avgDuration, failedLogs, freshness }
  }, [syncLogs, clients])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Učitavanje monitoring podataka...</div>
  }

  if (!stats || stats.total === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Nema sync log podataka za poslednjih 7 dana.</div>
  }

  const chartData = {
    labels: stats.sortedDays.map(d => d.substring(5)), // MM-DD
    datasets: [
      { label: 'Uspešno', data: stats.sortedDays.map(d => stats.byDay[d].success), backgroundColor: '#16a34a' },
      { label: 'Neuspešno', data: stats.sortedDays.map(d => stats.byDay[d].failed), backgroundColor: '#dc2626' }
    ]
  }

  const clientIds = Object.keys(clients)

  return (
    <div>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Ukupno sync-ova', value: stats.total, color: '#4a6cf7' },
          { label: 'Uspešno', value: `${stats.successRate.toFixed(1)}%`, color: '#16a34a' },
          { label: 'Neuspešno', value: stats.failed, color: stats.failed > 0 ? '#dc2626' : '#16a34a' },
          { label: 'Prosečno trajanje', value: `${stats.avgDuration.toFixed(1)}s`, color: '#8b5cf6' }
        ].map(card => (
          <div key={card.label} style={{
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderLeft: `3px solid ${card.color}`, borderRadius: 'var(--radius-default)',
            padding: '18px 18px 18px 16px', boxShadow: 'var(--shadow-default)'
          }}>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
              {card.label}
            </div>
            <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: '-0.02em', color: card.color }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* Chart + Sources */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
        <div style={{
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)'
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
            Sync-ovi po danima (7 dana)
          </div>
          <div style={{ position: 'relative', height: 240 }}>
            <Bar data={chartData} options={{
              responsive: true, maintainAspectRatio: false,
              scales: {
                x: { stacked: true },
                y: { stacked: true, beginAtZero: true, ticks: { stepSize: 1 } }
              },
              plugins: { legend: { position: 'bottom' } }
            }} />
          </div>
        </div>

        <div style={{
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)'
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
            Po izvoru
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '8px 0', textAlign: 'left', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Izvor</th>
                <th style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Uspešno</th>
                <th style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Neuspešno</th>
                <th style={{ padding: '8px 0', textAlign: 'right', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', color: 'var(--color-text-secondary)' }}>Ukupno</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(stats.bySource).map(([src, s]) => (
                <tr key={src} style={{ borderBottom: '1px solid var(--color-border-light)' }}>
                  <td style={{ padding: '8px 0', fontWeight: 500 }}>{src}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: '#16a34a' }}>{s.success}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: s.failed > 0 ? '#dc2626' : 'var(--color-text-secondary)' }}>{s.failed}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right' }}>{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Failed Syncs */}
      {stats.failedLogs.length > 0 && (
        <div style={{
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)',
          marginBottom: 24
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16, color: '#dc2626' }}>
            Neuspešni sync-ovi
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stats.failedLogs.slice(0, 10).map((log, i) => (
              <div key={log.id || i} style={{
                padding: '10px 14px', background: 'rgba(220,38,38,0.04)',
                borderRadius: 6, border: '1px solid rgba(220,38,38,0.12)', fontSize: 12
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{log.source || log.function_name || '—'}</span>
                  <span style={{ color: 'var(--color-text-secondary)' }}>
                    {log.started_at ? new Date(log.started_at).toLocaleString('sr-RS') : '—'}
                  </span>
                </div>
                {log.error_message && (
                  <div style={{ color: '#dc2626', fontFamily: 'monospace', fontSize: 11 }}>
                    {log.error_message.substring(0, 200)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Freshness */}
      <div style={{
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)'
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
          Svežina podataka po klijentu
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {clientIds.map(cid => {
            const lastSync = stats.freshness[cid]
            const hoursAgo = lastSync ? ((Date.now() - new Date(lastSync).getTime()) / 3600000) : null
            const isStale = hoursAgo === null || hoursAgo > 26
            const dotColor = isStale ? '#dc2626' : hoursAgo > 13 ? '#d97706' : '#16a34a'

            return (
              <div key={cid} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                background: `${dotColor}08`, borderRadius: 6, border: `1px solid ${dotColor}20`
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {clients[cid]?.name || cid}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                    {lastSync ? `Pre ${hoursAgo < 1 ? 'manje od 1h' : Math.round(hoursAgo) + 'h'}` : 'Nema podataka'}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
