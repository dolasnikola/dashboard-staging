import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { getSheetLinks } from '../../lib/cache'
import { PLATFORM_NAMES } from '../../lib/data'
import { syncOneSheet, syncAllSheets, syncGA4Sheet, saveSheetLinks } from '../../lib/sync'

export default function SheetsModal({ onClose }) {
  const { clients, notify } = useAppStore()
  const [links, setLinks] = useState({})
  const [statuses, setStatuses] = useState({})
  const [syncProgress, setSyncProgress] = useState('')

  useEffect(() => {
    setLinks({ ...getSheetLinks() })
  }, [])

  const handleStatusUpdate = (key, type, msg) => {
    setStatuses(prev => ({ ...prev, [key]: { type, msg } }))
  }

  const handleSyncOne = async (clientId, platform) => {
    await syncOneSheet(clientId, platform, handleStatusUpdate)
  }

  const handleSyncAll = async () => {
    setSyncProgress('Sync u toku...')
    await syncAllSheets(
      (done, total, errors) => {
        setSyncProgress(`Sync u toku... ${done}/${total}${errors > 0 ? ` (${errors} grešaka)` : ''}`)
      },
      notify
    )
    setSyncProgress('Sync završen')
  }

  const handleSyncGA4 = async () => {
    await syncGA4Sheet(notify)
    notify('GA4 podaci sinhronizovani', 'success')
  }

  const handleSave = async () => {
    await saveSheetLinks(links)
    notify('Sheet linkovi sačuvani')
  }

  const getStatusEl = (key) => {
    const s = statuses[key]
    if (!s) return null
    const color = s.type === 'success' ? 'var(--color-green)' : s.type === 'error' ? 'var(--color-red)' : 'var(--color-orange)'
    return <span style={{ fontSize: 11, color }}>{s.msg}</span>
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width: 700 }}>
        <h2>Google Sheets Sync</h2>
        <p>Unesi publish CSV linkove za svaki klijent/platformu. (File → Share → Publish to web → CSV)</p>

        <div style={{ maxHeight: '55vh', overflowY: 'auto' }}>
          {Object.entries(clients).map(([id, client]) => {
            const allPlatforms = [...client.platforms]
            if (client.tiktok) allPlatforms.push('tiktok')

            return (
              <div key={id}>
                <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 700, fontSize: 14 }}>{client.name}</div>
                {allPlatforms.map(p => {
                  const key = `${id}_${p}`
                  return (
                    <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'end', marginTop: 6 }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>
                          {PLATFORM_NAMES[p]}
                        </label>
                        <input
                          type="url" value={links[key] || ''}
                          onChange={e => setLinks(prev => ({ ...prev, [key]: e.target.value }))}
                          placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                          style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12 }}
                        />
                      </div>
                      <button className="btn" style={{ fontSize: 11, padding: '7px 12px', whiteSpace: 'nowrap' }} onClick={() => handleSyncOne(id, p)}>
                        Sync
                      </button>
                      {getStatusEl(key)}
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* GA4 KPI Sheet */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: '2px solid var(--color-border)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>GA4 KPI (NLB)</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 3 }}>GA4 KPI Sheet CSV</label>
                <input
                  type="url" value={links['nlb_ga4'] || ''}
                  onChange={e => setLinks(prev => ({ ...prev, nlb_ga4: e.target.value }))}
                  placeholder="https://docs.google.com/spreadsheets/d/e/.../pub?output=csv"
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--color-border)', borderRadius: 6, fontSize: 12 }}
                />
              </div>
              <button className="btn" style={{ fontSize: 11, padding: '7px 12px' }} onClick={handleSyncGA4}>Sync</button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20, alignItems: 'center' }}>
          <button className="btn" onClick={handleSyncAll} style={{ background: 'var(--color-green)', color: 'white', borderColor: 'var(--color-green)' }}>
            Sync sve
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={onClose}>Zatvori</button>
            <button className="btn btn-primary" onClick={handleSave}>Sačuvaj linkove</button>
          </div>
        </div>
        {syncProgress && <div style={{ marginTop: 12, fontSize: 12, color: 'var(--color-text-secondary)' }}>{syncProgress}</div>}
      </div>
    </div>
  )
}
