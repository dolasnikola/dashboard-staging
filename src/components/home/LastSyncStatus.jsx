import { useState, useEffect } from 'react'
import { dbGetLastSync } from '../../lib/db'

export default function LastSyncStatus() {
  const [syncText, setSyncText] = useState('')

  useEffect(() => {
    (async () => {
      try {
        const sync = await dbGetLastSync()
        if (!sync) return
        const finished = sync.finished_at ? new Date(sync.finished_at) : null
        if (!finished) { setSyncText('Sync u toku...'); return }
        const mins = Math.round((Date.now() - finished.getTime()) / 60000)
        let timeAgo
        if (mins < 1) timeAgo = 'upravo'
        else if (mins < 60) timeAgo = `pre ${mins} min`
        else if (mins < 1440) timeAgo = `pre ${Math.round(mins / 60)}h`
        else timeAgo = `pre ${Math.round(mins / 1440)} dana`
        const statusColor = sync.status === 'completed' ? 'var(--color-green)' : 'var(--color-orange)'
        setSyncText(`<span style="color:${statusColor}">●</span> Poslednji sync: ${timeAgo}`)
      } catch { /* ignore */ }
    })()
  }, [])

  if (!syncText) return null
  return <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }} dangerouslySetInnerHTML={{ __html: syncText }} />
}
