import { useState, useEffect } from 'react'
import { dbGetLastSync } from '../../lib/db'

export default function SyncStatusIndicator() {
  const [syncInfo, setSyncInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSync()
    // Refresh every 5 minutes
    const interval = setInterval(loadSync, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const loadSync = async () => {
    const data = await dbGetLastSync()
    setSyncInfo(data)
    setLoading(false)
  }

  if (loading) return null

  let color, statusText
  if (!syncInfo) {
    color = '#9ca3af' // gray
    statusText = 'Nema sync podataka'
  } else {
    const hoursAgo = (Date.now() - new Date(syncInfo.started_at).getTime()) / 3600000
    const isError = syncInfo.status === 'error' || syncInfo.status === 'failed'

    if (isError) {
      color = '#dc2626' // red
      statusText = `Sync neuspešan (pre ${Math.round(hoursAgo)}h)`
    } else if (hoursAgo > 24) {
      color = '#dc2626'
      statusText = `Poslednji sync pre ${Math.round(hoursAgo)}h`
    } else if (hoursAgo > 12) {
      color = '#d97706' // orange
      statusText = `Poslednji sync pre ${Math.round(hoursAgo)}h`
    } else {
      color = '#16a34a' // green
      statusText = hoursAgo < 1
        ? 'Sync aktivan (< 1h)'
        : `Poslednji sync pre ${Math.round(hoursAgo)}h`
    }
  }

  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', cursor: 'default' }}
      title={statusText}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        boxShadow: `0 0 6px ${color}60`,
        animation: color === '#16a34a' ? 'pulse 2s ease-in-out infinite' : 'none'
      }} />
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
