import { useState, useEffect } from 'react'
import { dbSelect, dbDelete, storageRemove } from '../../lib/api'
import { useAppStore } from '../../stores/appStore'
import { useAuthStore } from '../../stores/authStore'

export default function ReportsTab({ clientId, client }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const notify = useAppStore(s => s.notify)
  const isAdmin = useAuthStore(s => s.currentUserRole) === 'admin'

  useEffect(() => {
    loadReports()
  }, [clientId])

  const loadReports = async () => {
    setLoading(true)
    const { data, error } = await dbSelect('report_history', {
      filters: [
        { column: 'client_id', op: 'eq', value: clientId },
        { column: 'status', op: 'eq', value: 'approved' }
      ],
      order: [{ column: 'generated_at', ascending: false }],
      limit: 50
    })

    if (error) {
      console.error('[ReportsTab] error:', error.message)
      notify('Greska pri ucitavanju izvestaja', 'error')
      setReports([])
    } else {
      setReports(data || [])
    }
    setLoading(false)
  }

  const handleDelete = async (report) => {
    if (!confirm('Obrisati ovaj izvestaj?')) return
    try {
      const urlPath = new URL(report.pdf_url).pathname
      const storagePath = decodeURIComponent(urlPath.split('/object/sign/reports/')[1]?.split('?')[0] || '')
      if (storagePath) await storageRemove('reports', [storagePath])
    } catch (e) { console.warn('[ReportsTab] storage delete:', e.message) }
    await dbDelete('report_history', [{ column: 'id', op: 'eq', value: report.id }])
    notify('Izvestaj obrisan')
    loadReports()
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Ucitavanje izvestaja...</div>
  }

  if (reports.length === 0) {
    return (
      <div style={{
        padding: 60, textAlign: 'center', color: 'var(--color-text-secondary)',
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-default)', boxShadow: 'var(--shadow-default)'
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>Nema odobrenih izvestaja</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Izvestaji ce se pojaviti ovde nakon sto ih admin odobri.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reports.map(report => {
          const date = new Date(report.generated_at)

          return (
            <div key={report.id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 20px', background: 'var(--color-card)',
              borderRadius: 'var(--radius-default)', border: '1px solid var(--color-border)',
              boxShadow: 'var(--shadow-default)'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>
                    {report.report_month}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 4,
                    background: '#16a34a15', color: '#16a34a', fontWeight: 600, textTransform: 'uppercase'
                  }}>
                    Odobreno
                  </span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 4 }}>
                  {date.toLocaleDateString('sr-RS', { day: 'numeric', month: 'long', year: 'numeric' })}
                  {' u '}
                  {date.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' })}
                  {report.generated_by && ` · ${report.generated_by}`}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {report.pdf_url && (
                  <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="btn" style={{ padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}>
                    Preuzmi PDF
                  </a>
                )}
                {isAdmin && (
                  <button className="btn" onClick={() => handleDelete(report)} style={{
                    padding: '6px 14px', fontSize: 12,
                    color: '#dc2626', borderColor: '#dc262630'
                  }}>
                    Obrisi
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
