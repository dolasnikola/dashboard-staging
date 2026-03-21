import { useState, useRef } from 'react'
import { useAppStore } from '../../stores/appStore'
import { parseCSV, detectPlatform, mapRow, PLATFORM_NAMES } from '../../lib/data'
import { dbSaveCampaignData } from '../../lib/db'

export default function ImportModal({ onClose }) {
  const { clients, notify } = useAppStore()
  const [clientId, setClientId] = useState(Object.keys(clients)[0] || '')
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [result, setResult] = useState(null)
  const [dragover, setDragover] = useState(false)
  const fileRef = useRef()

  const handleFile = (file) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target.result
      const { headers, rows } = parseCSV(text)
      const platform = detectPlatform(headers)

      if (!platform) {
        setResult({ type: 'error', text: 'Platforma nije prepoznata. Proveri CSV format.' })
        return
      }

      const mapped = rows.map(r => mapRow(platform, r))
      await dbSaveCampaignData(clientId, platform, month, mapped)

      setResult({
        type: 'success',
        text: `Uspešno importovano ${mapped.length} redova sa ${PLATFORM_NAMES[platform]} za ${clients[clientId].name} (${month})`
      })
      notify(`${PLATFORM_NAMES[platform]} podaci importovani za ${clients[clientId].name}`)
    }
    reader.readAsText(file)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Import CSV</h2>
        <p>Prevuci CSV fajl ili klikni da izabereš. Dashboard automatski detektuje platformu.</p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Klijent</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)} style={{
              width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-body)'
            }}>
              {Object.entries(clients).map(([id, c]) => <option key={id} value={id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Mesec</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{
              width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)',
              borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-body)'
            }} />
          </div>
        </div>

        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragover(true) }}
          onDragLeave={() => setDragover(false)}
          onDrop={e => { e.preventDefault(); setDragover(false); if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]) }}
          style={{
            border: `2px dashed ${dragover ? 'var(--color-accent)' : 'var(--color-border)'}`,
            borderRadius: 'var(--radius-default)', padding: 48, textAlign: 'center',
            cursor: 'pointer', transition: 'all 0.25s ease', marginBottom: 16,
            background: dragover ? 'var(--color-accent-light)' : 'var(--color-bg)'
          }}
        >
          <div style={{ fontSize: 40, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 14, color: 'var(--color-text-secondary)' }}>
            <strong style={{ color: 'var(--color-accent)' }}>Klikni</strong> ili prevuci CSV fajl ovde
          </div>
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => { if (e.target.files.length) handleFile(e.target.files[0]) }} />

        {result && (
          <div style={{
            padding: 12, borderRadius: 'var(--radius-sm)', fontSize: 13, marginTop: 12, fontWeight: 500,
            background: result.type === 'error' ? 'var(--color-red-light)' : 'var(--color-green-light)',
            color: result.type === 'error' ? 'var(--color-red)' : 'var(--color-green)'
          }}>
            {result.text}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn" onClick={onClose}>Zatvori</button>
        </div>
      </div>
    </div>
  )
}
