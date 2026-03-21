import { useAppStore } from '../../stores/appStore'
import ClientCard from './ClientCard'
import LastSyncStatus from './LastSyncStatus'

export default function HomePage() {
  const { clients, isInitialized } = useAppStore()

  if (!isInitialized) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⏳</div>
          Učitavanje podataka...
        </div>
      </div>
    )
  }

  if (Object.keys(clients).length === 0) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Nema klijenata. Proveri konekciju i rolu u bazi.
          <br /><small style={{ marginTop: 8, display: 'block' }}>Otvori F12 Console i pokreni <code>runDiagnostics()</code> za detalje.</small>
        </div>
      </div>
    )
  }

  const currentMonth = new Date().toISOString().slice(0, 7)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ fontSize: 16, color: 'var(--color-text-secondary)', margin: 0 }}>Klijenti</h2>
        <LastSyncStatus />
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
        gap: 20
      }}>
        {Object.entries(clients).map(([id, client], index) => (
          <ClientCard key={id} id={id} client={client} currentMonth={currentMonth} index={index} />
        ))}
      </div>
    </div>
  )
}
