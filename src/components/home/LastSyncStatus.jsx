import { useState, useEffect } from 'react'
import { dbGetLastSync } from '../../lib/db'

export default function LastSyncStatus() {
  const [syncInfo, setSyncInfo] = useState(null)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const sync = await dbGetLastSync()
        if (!mounted || !sync) return
        const finished = sync.finished_at ? new Date(sync.finished_at) : null
        if (!finished) { setSyncInfo({ text: 'Sync u toku...', color: 'var(--color-orange)' }); return }
        const mins = Math.round((Date.now() - finished.getTime()) / 60000)
        let timeAgo
        if (mins < 1) timeAgo = 'upravo'
        else if (mins < 60) timeAgo = `pre ${mins} min`
        else if (mins < 1440) timeAgo = `pre ${Math.round(mins / 60)}h`
        else timeAgo = `pre ${Math.round(mins / 1440)} dana`
        const color = sync.status === 'completed' ? 'var(--color-green)' : 'var(--color-orange)'
        setSyncInfo({ text: `Poslednji sync: ${timeAgo}`, color })
      } catch { /* ignore */ }
    })()
    return () => { mounted = false }
  }, [])

  if (!syncInfo) return null
  return (
    <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
      <span style={{ color: syncInfo.color }}>●</span> {syncInfo.text}
    </span>
  )
}
