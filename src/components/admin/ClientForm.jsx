import { useState } from 'react'
import { PLATFORM_NAMES } from '../../lib/data'

const ALL_PLATFORMS = Object.keys(PLATFORM_NAMES)

export default function ClientForm({ client, onSave, onCancel }) {
  const isEdit = !!client
  const [form, setForm] = useState({
    id: client?.id || '',
    name: client?.name || '',
    currency: client?.currency || 'EUR',
    status: client?.status || 'active',
    statusLabel: client?.statusLabel || 'Aktivna kampanja',
    platforms: client?.platforms || [],
    defaultPlatform: client?.defaultPlatform || '',
    budgetNote: client?.budgetNote || '',
    sheetLinks: {}
  })
  const [saving, setSaving] = useState(false)

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }))

  const togglePlatform = (p) => {
    const current = form.platforms
    const updated = current.includes(p) ? current.filter(x => x !== p) : [...current, p]
    set('platforms', updated)
    if (form.defaultPlatform === p && !updated.includes(p)) {
      set('defaultPlatform', updated[0] || '')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.id.trim() || !form.name.trim()) return
    if (form.platforms.length === 0) return
    setSaving(true)
    await onSave({
      ...form,
      id: form.id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_'),
      defaultPlatform: form.defaultPlatform || form.platforms[0]
    })
    setSaving(false)
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: 13,
    background: 'var(--color-card)'
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>
        {isEdit ? `Izmeni: ${client.name}` : 'Novi klijent'}
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>ID (slug) *</label>
          <input style={inputStyle} value={form.id} disabled={isEdit}
            onChange={e => set('id', e.target.value)}
            placeholder="npr. urban_garden" required />
        </div>
        <div>
          <label style={labelStyle}>Naziv *</label>
          <input style={inputStyle} value={form.name}
            onChange={e => set('name', e.target.value)}
            placeholder="npr. Urban Garden" required />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label style={labelStyle}>Valuta</label>
          <select style={inputStyle} value={form.currency} onChange={e => set('currency', e.target.value)}>
            <option value="EUR">EUR</option>
            <option value="RSD">RSD</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status</label>
          <select style={inputStyle} value={form.status} onChange={e => set('status', e.target.value)}>
            <option value="active">Aktivan</option>
            <option value="paused">Pauziran</option>
            <option value="ended">Završen</option>
          </select>
        </div>
        <div />
      </div>

      <div>
        <label style={labelStyle}>Status label</label>
        <input style={inputStyle} value={form.statusLabel}
          onChange={e => set('statusLabel', e.target.value)}
          placeholder="npr. Aktivna kampanja" />
      </div>

      <div>
        <label style={labelStyle}>Platforme *</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ALL_PLATFORMS.map(p => (
            <label key={p} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)',
              background: form.platforms.includes(p) ? 'var(--color-accent-light)' : 'var(--color-card)',
              cursor: 'pointer', fontSize: 13
            }}>
              <input type="checkbox" checked={form.platforms.includes(p)}
                onChange={() => togglePlatform(p)} style={{ accentColor: 'var(--color-accent)' }} />
              {PLATFORM_NAMES[p]}
            </label>
          ))}
        </div>
      </div>

      {form.platforms.length > 0 && (
        <div>
          <label style={labelStyle}>Podrazumevana platforma</label>
          <select style={inputStyle} value={form.defaultPlatform}
            onChange={e => set('defaultPlatform', e.target.value)}>
            {form.platforms.map(p => <option key={p} value={p}>{PLATFORM_NAMES[p]}</option>)}
          </select>
        </div>
      )}

      {/* Sheet URLs po platformi */}
      {form.platforms.length > 0 && (
        <div>
          <label style={labelStyle}>Google Sheet URLs po platformi</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {form.platforms.map(p => (
              <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, minWidth: 80, color: 'var(--color-text-secondary)' }}>{PLATFORM_NAMES[p]}</span>
                <input style={{ ...inputStyle, flex: 1 }}
                  value={form.sheetLinks[p] || ''}
                  onChange={e => set('sheetLinks', { ...form.sheetLinks, [p]: e.target.value })}
                  placeholder="https://docs.google.com/spreadsheets/..." />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label style={labelStyle}>Budget napomena</label>
        <input style={inputStyle} value={form.budgetNote}
          onChange={e => set('budgetNote', e.target.value)}
          placeholder="npr. Budžet uključuje PDV" />
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8 }}>
        <button type="button" className="btn" onClick={onCancel}>Otkaži</button>
        <button type="submit" className="btn" disabled={saving || !form.id || !form.name || form.platforms.length === 0}
          style={{ background: 'var(--color-accent)', color: 'white', borderColor: 'var(--color-accent)' }}>
          {saving ? 'Čuvanje...' : isEdit ? 'Sačuvaj izmene' : 'Kreiraj klijenta'}
        </button>
      </div>
    </form>
  )
}
