import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'

export default function ReportsTab({ clientId, client }) {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadReports()
  }, [clientId])

  const loadReports = async () => {
    setLoading(true)
    const { data, error } = await sb
      .from('report_history')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) {
      console.error('[ReportsTab] error:', error.message)
      setReports([])
    } else {
      setReports(data || [])
    }
    setLoading(false)
  }

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)' }}>Učitavanje izveštaja...</div>
  }

  if (reports.length === 0) {
    return (
      <div style={{
        padding: 60, textAlign: 'center', color: 'var(--color-text-secondary)',
        background: 'var(--color-card)', border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-default)', boxShadow: 'var(--shadow-default)'
      }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
        <div style={{ fontSize: 15, fontWeight: 500 }}>Nema generisanih izveštaja</div>
        <div style={{ fontSize: 13, marginTop: 6 }}>Izveštaji će se pojaviti ovde nakon generisanja.</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reports.map(report => {
          const date = new Date(report.created_at)
          const statusColor = report.status === 'success' ? '#16a34a' : report.status === 'error' ? '#dc2626' : '#d97706'

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
                    {report.report_month || report.title || 'Izveštaj'}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 4,
                    background: `${statusColor}15`, color: statusColor, fontWeight: 600, textTransform: 'uppercase'
                  }}>
                    {report.status === 'success' ? 'Uspešno' : report.status === 'error' ? 'Greška' : report.status}
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
                {report.file_url && (
                  <a href={report.file_url} target="_blank" rel="noopener noreferrer"
                    className="btn" style={{ padding: '6px 14px', fontSize: 12, textDecoration: 'none' }}>
                    Preuzmi PDF
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
