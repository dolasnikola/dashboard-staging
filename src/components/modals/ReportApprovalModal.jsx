import { useState } from 'react'
import { useAppStore } from '../../stores/appStore'
import { uploadReportPDF, clearAINarrativeCache } from '../../lib/reportStorage'

export default function ReportApprovalModal({ blob, filename, clientId, clientName, reportMonth, reportConfigId, onClose }) {
  const notify = useAppStore(s => s.notify)
  const [uploading, setUploading] = useState(false)

  const handlePreview = () => {
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
  }

  const handleApprove = async () => {
    setUploading(true)
    const url = await uploadReportPDF(blob, clientId, reportMonth, filename, reportConfigId, clientName)
    setUploading(false)

    if (url) {
      notify('Izvestaj sacuvan i dostupan za preuzimanje')
      onClose(true)
    } else {
      notify('Greska pri cuvanju izvestaja', 'warning')
    }
  }

  const handleReject = () => {
    clearAINarrativeCache(clientId, reportMonth)
    notify('AI tekst obrisan — mozete ponovo generisati izvestaj')
    onClose(false)
  }

  return (
    <div className="modal-overlay" onClick={() => !uploading && onClose(false)}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <h3 style={{ margin: '0 0 16px', fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400 }}>
          Potvrda izvestaja
        </h3>

        <div style={{
          padding: '12px 16px', background: 'var(--color-bg-subtle)',
          borderRadius: 'var(--radius-sm)', marginBottom: 16
        }}>
          <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 4 }}>Generisan fajl:</div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{filename}</div>
        </div>

        <button className="btn" onClick={handlePreview} style={{ width: '100%', marginBottom: 20 }}>
          Pregledaj PDF
        </button>

        <div style={{ fontSize: 14, marginBottom: 16, color: 'var(--color-text-secondary)' }}>
          Da li je izvestaj u redu za cuvanje?
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-primary"
            disabled={uploading}
            onClick={handleApprove}
            style={{ flex: 1, ...(uploading ? { opacity: 0.7, cursor: 'wait' } : {}) }}
          >
            {uploading ? 'Cuvanje...' : 'Da, sacuvaj'}
          </button>
          <button
            className="btn"
            disabled={uploading}
            onClick={handleReject}
            style={{ flex: 1 }}
          >
            Ne, ponovo generisi
          </button>
        </div>
      </div>
    </div>
  )
}
