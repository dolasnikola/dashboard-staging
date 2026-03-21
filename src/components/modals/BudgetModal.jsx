import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { dbGetBudget } from '../../lib/cache'
import { dbSetBudget } from '../../lib/db'
import { PLATFORM_NAMES } from '../../lib/data'

export default function BudgetModal({ onClose }) {
  const { clients, notify } = useAppStore()
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [values, setValues] = useState({})

  useEffect(() => {
    const v = {}
    Object.entries(clients).forEach(([id, client]) => {
      client.platforms.forEach(p => {
        v[`${id}_${p}`] = dbGetBudget(id, p, month) || ''
      })
    })
    setValues(v)
  }, [month, clients])

  const handleSave = async () => {
    const promises = []
    Object.entries(values).forEach(([key, val]) => {
      const [clientId, platform] = [key.substring(0, key.indexOf('_')), key.substring(key.indexOf('_') + 1)]
      promises.push(dbSetBudget(clientId, platform, month, parseFloat(val) || 0))
    })
    await Promise.all(promises)
    onClose()
    notify('Budžeti su sačuvani')
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Podesi budžet</h2>
        <p>Unesi mesečni budžet po klijentu i platformi.</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, fontWeight: 500 }}>Mesec</label>
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} style={{
            width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-body)'
          }} />
        </div>

        {Object.entries(clients).map(([id, client]) => (
          <div key={id}>
            <div style={{ marginTop: 16, fontWeight: 600, fontSize: 14 }}>{client.name} ({client.currency})</div>
            {client.platforms.map(p => {
              const key = `${id}_${p}`
              return (
                <div key={key} style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'end' }}>
                  <div>
                    <label style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4, fontWeight: 500 }}>
                      {PLATFORM_NAMES[p]}
                    </label>
                    <input
                      type="number" value={values[key] || ''} placeholder="0"
                      onChange={e => setValues(prev => ({ ...prev, [key]: e.target.value }))}
                      style={{
                        width: '100%', padding: '9px 12px', border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-sm)', fontSize: 13, fontFamily: 'var(--font-body)'
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ))}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
          <button className="btn" onClick={onClose}>Otkaži</button>
          <button className="btn btn-primary" onClick={handleSave}>Sačuvaj</button>
        </div>
      </div>
    </div>
  )
}
