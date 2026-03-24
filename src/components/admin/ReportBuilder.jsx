import { useState, useEffect } from 'react'
import { useAppStore } from '../../stores/appStore'
import { dbGetAllReportConfigs, dbSaveReportConfig, dbDeleteReportConfig } from '../../lib/db'
import { PLATFORM_NAMES } from '../../lib/data'

const PLATFORM_KEYS = {
  google_ads: 'search',
  meta: 'meta',
  dv360: 'gdn'
}

const DEFAULT_METRIC_COLS = {
  google_ads: { label: 'Ad group', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'spend'] },
  meta: { label: 'Campaign', cols: ['campaign', 'reach', 'impressions', 'clicks', 'ctr', 'spend'] },
  dv360: { label: 'Campaign', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'cpm', 'spend'] },
  dv360_io: { label: 'Insertion Order', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'cpm', 'spend'] }
}

const DEFAULT_PLATFORM_LABELS = {
  google_ads: 'Google Search',
  meta: 'Meta - Facebook & Instagram',
  dv360: 'Google Display Network'
}

export default function ReportBuilder() {
  const { clients, notify } = useAppStore()
  const [configs, setConfigs] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null) // null=list, configObj=editing

  const loadConfigs = async () => {
    setLoading(true)
    const data = await dbGetAllReportConfigs()
    setConfigs(data)
    setLoading(false)
  }

  useEffect(() => { loadConfigs() }, [])

  const clientIds = Object.keys(clients)
  const configuredClients = configs.map(c => c.client_id)
  const unconfiguredClients = clientIds.filter(id => !configuredClients.includes(id))

  const handleNewConfig = (clientId) => {
    const client = clients[clientId]
    const platforms = client?.platforms?.filter(p => p !== 'ga4') || []
    const platformLabels = {}
    const metricCols = {}
    const sheetUrls = {}

    platforms.forEach(p => {
      platformLabels[p] = DEFAULT_PLATFORM_LABELS[p] || PLATFORM_NAMES[p] || p
      metricCols[p] = DEFAULT_METRIC_COLS[p] || { label: 'Campaign', cols: ['campaign', 'impressions', 'clicks', 'ctr', 'spend'] }
      if (p === 'dv360') metricCols.dv360_io = DEFAULT_METRIC_COLS.dv360_io
    })

    setEditing({
      client_id: clientId,
      report_type: 'monthly',
      platform_labels: platformLabels,
      metric_cols: metricCols,
      sheet_urls: sheetUrls,
      creatives_config: {},
      ai_worker_url: '',
      ai_prompt_context: '',
      gdn_campaign_filter: '',
      schedule_day: 6,
      schedule_hour: 8,
      is_active: true
    })
  }

  const handleSave = async () => {
    const ok = await dbSaveReportConfig(editing)
    if (ok) {
      notify(editing.id ? 'Konfiguracija azurirana' : 'Konfiguracija kreirana')
      setEditing(null)
      loadConfigs()
    } else {
      notify('Greska pri cuvanju konfiguracije', 'warning')
    }
  }

  const handleDelete = async (configId) => {
    const ok = await dbDeleteReportConfig(configId)
    if (ok) { notify('Konfiguracija obrisana'); loadConfigs() }
    else notify('Greska pri brisanju', 'warning')
  }

  const inputStyle = {
    width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)', fontSize: 13,
    background: 'var(--color-card)'
  }
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4, color: 'var(--color-text-secondary)' }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Ucitavanje...</div>

  // Edit mode
  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>
          {editing.id ? 'Izmeni report konfiguraciju' : 'Nova report konfiguracija'}: {clients[editing.client_id]?.name || editing.client_id}
        </h3>

        {/* Sheet URLs */}
        <div>
          <label style={labelStyle}>Sheet URLs (CSV published)</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.keys(editing.platform_labels).map(platform => {
              const sheetKey = PLATFORM_KEYS[platform] || platform
              return (
                <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, minWidth: 120, color: 'var(--color-text-secondary)' }}>
                    {editing.platform_labels[platform]}
                  </span>
                  <input style={{ ...inputStyle, flex: 1 }}
                    value={editing.sheet_urls[sheetKey] || ''}
                    onChange={e => setEditing(prev => ({
                      ...prev,
                      sheet_urls: { ...prev.sheet_urls, [sheetKey]: e.target.value }
                    }))}
                    placeholder="https://docs.google.com/spreadsheets/..." />
                </div>
              )
            })}
          </div>
        </div>

        {/* Platform Labels */}
        <div>
          <label style={labelStyle}>Nazivi platformi u izvestaju</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {Object.entries(editing.platform_labels).map(([platform, label]) => (
              <div key={platform} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, minWidth: 120, color: 'var(--color-text-secondary)' }}>
                  {PLATFORM_NAMES[platform] || platform}
                </span>
                <input style={{ ...inputStyle, flex: 1 }} value={label}
                  onChange={e => setEditing(prev => ({
                    ...prev,
                    platform_labels: { ...prev.platform_labels, [platform]: e.target.value }
                  }))} />
              </div>
            ))}
          </div>
        </div>

        {/* AI Worker URL */}
        <div>
          <label style={labelStyle}>AI Worker URL (Cloudflare)</label>
          <input style={inputStyle} value={editing.ai_worker_url || ''}
            onChange={e => setEditing(prev => ({ ...prev, ai_worker_url: e.target.value }))}
            placeholder="https://client-report-api.workers.dev" />
        </div>

        {/* GDN Campaign Filter */}
        <div>
          <label style={labelStyle}>GDN Campaign Filter (opciono)</label>
          <input style={inputStyle} value={editing.gdn_campaign_filter || ''}
            onChange={e => setEditing(prev => ({ ...prev, gdn_campaign_filter: e.target.value }))}
            placeholder="npr. Krka Terme" />
        </div>

        {/* Schedule */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Dan generisanja (u mesecu)</label>
            <input style={inputStyle} type="number" min="1" max="28" value={editing.schedule_day || 6}
              onChange={e => setEditing(prev => ({ ...prev, schedule_day: parseInt(e.target.value) || 6 }))} />
          </div>
          <div>
            <label style={labelStyle}>Sat generisanja</label>
            <input style={inputStyle} type="number" min="0" max="23" value={editing.schedule_hour || 8}
              onChange={e => setEditing(prev => ({ ...prev, schedule_hour: parseInt(e.target.value) || 8 }))} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 8 }}>
          <button className="btn" onClick={() => setEditing(null)}>Otkazi</button>
          <button className="btn" onClick={handleSave}
            style={{ background: 'var(--color-accent)', color: 'white', borderColor: 'var(--color-accent)' }}>
            {editing.id ? 'Sacuvaj izmene' : 'Kreiraj konfiguraciju'}
          </button>
        </div>
      </div>
    )
  }

  // List mode
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {unconfiguredClients.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <select id="newReportClient" style={{ ...inputStyle, width: 'auto', display: 'inline-block', marginRight: 8 }}>
            <option value="">Izaberi klijenta...</option>
            {unconfiguredClients.map(id => (
              <option key={id} value={id}>{clients[id]?.name || id}</option>
            ))}
          </select>
          <button className="btn" onClick={() => {
            const sel = document.getElementById('newReportClient')
            if (sel?.value) handleNewConfig(sel.value)
          }} style={{ background: 'var(--color-accent)', color: 'white', borderColor: 'var(--color-accent)' }}>
            + Novi report config
          </button>
        </div>
      )}

      {configs.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Nema konfiguracija izvestaja.
        </div>
      ) : configs.map(config => (
        <div key={config.id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'var(--color-card)',
          borderRadius: 'var(--radius-default)', border: '1px solid var(--color-border)',
          boxShadow: 'var(--shadow-default)'
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{clients[config.client_id]?.name || config.client_id}</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              {config.report_type} · Platforme: {Object.keys(config.platform_labels || {}).join(', ')}
              {config.ai_worker_url && ' · AI narativi'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2 }}>
              Generisanje: {config.schedule_day}. u mesecu u {config.schedule_hour}:00h
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" style={{ padding: '5px 14px', fontSize: 12 }}
              onClick={() => setEditing(config)}>
              Izmeni
            </button>
            <button className="btn" style={{ padding: '5px 14px', fontSize: 12, color: 'var(--color-red)' }}
              onClick={() => handleDelete(config.id)}>
              Obrisi
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
