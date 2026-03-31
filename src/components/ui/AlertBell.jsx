import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAlerts, getUnreadAlertCount } from '../../lib/cache'
import { markAlertRead, markAllAlertsRead, dismissAlert } from '../../lib/db'
import { PLATFORM_NAMES } from '../../lib/data'

const SEVERITY_STYLES = {
  critical: { color: '#dc2626', bg: '#fef2f2', icon: '!!' },
  warning:  { color: '#d97706', bg: '#fffbeb', icon: '!' },
  info:     { color: '#2563eb', bg: '#eff6ff', icon: 'i' }
}

const TYPE_LABELS = {
  budget_pacing: 'Budžet',
  metric_anomaly: 'Anomalija',
  sync_failure: 'Sync greška'
}

export default function AlertBell() {
  const [open, setOpen] = useState(false)
  const [, forceUpdate] = useState(0)
  const ref = useRef(null)
  const navigate = useNavigate()

  const unreadCount = getUnreadAlertCount()
  const alerts = getAlerts()

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const refresh = () => forceUpdate(n => n + 1)

  async function handleMarkAllRead() {
    await markAllAlertsRead()
    refresh()
  }

  async function handleDismiss(e, alertId) {
    e.stopPropagation()
    await dismissAlert(alertId)
    refresh()
  }

  async function handleAlertClick(alert) {
    if (!alert.is_read) {
      await markAlertRead(alert.id)
    }
    setOpen(false)
    if (alert.client_id) navigate(`/${alert.client_id}`)
    refresh()
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '6px 10px', borderRadius: 'var(--radius-sm)',
          color: 'var(--color-text-secondary)', fontSize: 18,
          position: 'relative', transition: 'color 0.2s'
        }}
        title="Obaveštenja"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 4,
            background: '#dc2626', color: 'white',
            fontSize: 9, fontWeight: 700, minWidth: 16, height: 16,
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 360, maxHeight: 420, overflowY: 'auto',
          background: 'var(--color-card)', border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-default)', boxShadow: 'var(--shadow-lg)',
          zIndex: 1000
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid var(--color-border)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Obaveštenja {unreadCount > 0 && `(${unreadCount})`}
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 11, color: 'var(--color-accent)', fontWeight: 500
                }}
              >
                Označi sve kao pročitano
              </button>
            )}
          </div>

          {/* Alert list */}
          {alerts.length === 0 ? (
            <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: 12 }}>
              Nema obaveštenja
            </div>
          ) : (
            alerts.map(alert => {
              const sev = SEVERITY_STYLES[alert.severity] || SEVERITY_STYLES.info
              return (
                <div
                  key={alert.id}
                  onClick={() => handleAlertClick(alert)}
                  style={{
                    padding: '12px 16px', cursor: 'pointer',
                    borderBottom: '1px solid var(--color-border)',
                    background: alert.is_read ? 'transparent' : 'rgba(37, 99, 235, 0.03)',
                    transition: 'background 0.15s'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-bg-subtle)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = alert.is_read ? 'transparent' : 'rgba(37, 99, 235, 0.03)' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    {/* Severity dot */}
                    <span style={{
                      marginTop: 3, width: 8, height: 8, borderRadius: '50%',
                      background: sev.color, flexShrink: 0
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: alert.is_read ? 500 : 700, lineHeight: 1.3 }}>
                          {alert.title}
                        </span>
                        <button
                          onClick={(e) => handleDismiss(e, alert.id)}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            fontSize: 14, color: 'var(--color-text-secondary)', padding: 2,
                            opacity: 0.5, flexShrink: 0
                          }}
                          title="Odbaci"
                        >
                          x
                        </button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--color-text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
                        {alert.message}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                        <span style={{
                          fontSize: 9, padding: '2px 6px', borderRadius: 4,
                          background: sev.bg, color: sev.color, fontWeight: 600, textTransform: 'uppercase'
                        }}>
                          {TYPE_LABELS[alert.alert_type] || alert.alert_type}
                        </span>
                        {alert.platform && (
                          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)' }}>
                            {PLATFORM_NAMES[alert.platform] || alert.platform}
                          </span>
                        )}
                        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', marginLeft: 'auto' }}>
                          {formatTimeAgo(alert.created_at)}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}

function formatTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'upravo'
  if (mins < 60) return `pre ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `pre ${hours}h`
  const days = Math.floor(hours / 24)
  return `pre ${days}d`
}
