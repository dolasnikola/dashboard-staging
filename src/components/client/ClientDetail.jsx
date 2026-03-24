import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../stores/appStore'
import { prefetchClientData } from '../../lib/db'
import DateRangeBar from './DateRangeBar'
import BudgetOverview from './BudgetOverview'
import PlatformTabs from './PlatformTabs'
import OverviewTab from './OverviewTab'
import PlatformView from './PlatformView'
import GA4View from './GA4View'
import { PLATFORM_NAMES, PLATFORM_BADGE } from '../../lib/data'
import { generateReport, fetchReportConfig } from '../../reports/generator'

export default function ClientDetail() {
  const { clientId } = useParams()
  const navigate = useNavigate()
  const clients = useAppStore(s => s.clients)
  const client = clients[clientId]
  const [isLoading, setIsLoading] = useState(true)
  const [activePlatform, setActivePlatform] = useState(null)
  const [hasReportConfig, setHasReportConfig] = useState(false)

  useEffect(() => {
    if (!client) return
    setIsLoading(true)
    prefetchClientData(clientId).then(() => {
      setActivePlatform(client.defaultPlatform || client.platforms[0])
      setIsLoading(false)
    })
    // Check if this client has a report config
    fetchReportConfig(clientId).then(config => setHasReportConfig(!!config))
  }, [clientId, !!client])

  if (!client) {
    return (
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Klijent nije pronađen.
          <br /><button className="btn" onClick={() => navigate('/')} style={{ marginTop: 16 }}>← Nazad</button>
        </div>
      </div>
    )
  }

  const allPlatforms = [...client.platforms]
  if (client.tiktok) allPlatforms.push('tiktok')

  // Report button (shown for any client with report_configs row)

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '28px 32px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-back" onClick={() => navigate('/')}>← Nazad</button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 400, letterSpacing: '-0.01em' }}>
                {client.name}
              </span>
              <span style={{
                fontSize: 11, padding: '3px 10px', borderRadius: 6,
                background: 'var(--color-accent-light)', color: 'var(--color-accent)', fontWeight: 600
              }}>
                {client.currency}
              </span>
              {hasReportConfig && (
                <button className="btn btn-primary" onClick={() => generateReport(clientId)}>
                  Mesecni izvestaj
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 6 }}>
              {client.platforms.map(p => (
                <span key={p} className={`platform-badge ${PLATFORM_BADGE[p]}`}>{PLATFORM_NAMES[p]}</span>
              ))}
              {client.tiktok && <span className="platform-badge badge-tiktok">TikTok</span>}
            </div>
          </div>
        </div>
      </div>

      <DateRangeBar />

      {isLoading ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--color-text-secondary)' }}>
          Učitavanje podataka...
        </div>
      ) : (
        <>
          <BudgetOverview clientId={clientId} client={client} />

          <PlatformTabs
            platforms={allPlatforms}
            activePlatform={activePlatform}
            defaultPlatform={client.defaultPlatform}
            onSwitch={setActivePlatform}
          />

          {activePlatform === 'overview' ? (
            <OverviewTab clientId={clientId} client={client} />
          ) : client.setup[activePlatform]?.type === 'ga4_kpi' ? (
            <GA4View clientId={clientId} />
          ) : (
            <PlatformView clientId={clientId} client={client} platform={activePlatform} />
          )}
        </>
      )}
    </div>
  )
}
