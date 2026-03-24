import { memo } from 'react'
import { Line } from 'react-chartjs-2'
import { METRIC_LABELS, fmtMetric } from '../../lib/data'

const sparkColors = {
  conversions: '#4a6cf7', cpa: '#ef4444', conv_value: '#22c55e', spend: '#f59e0b',
  impressions: '#4a6cf7', reach: '#8b5cf6', cpm: '#ef4444', ctr: '#22c55e',
  clicks: '#06b6d4', cpc: '#ec4899'
}

export default memo(function MetricCard({ metric, value, currency, mom, dailyData, index }) {
  const color = sparkColors[metric] || '#94a3b8'

  return (
    <div style={{
      background: 'var(--color-card)', border: '1px solid var(--color-border)',
      borderLeft: '3px solid var(--color-accent)', borderRadius: 'var(--radius-default)',
      padding: '18px 18px 18px 16px', boxShadow: 'var(--shadow-default)',
      animation: 'cardFadeUp 0.4s ease both',
      animationDelay: index !== undefined ? `${index * 0.05}s` : '0s'
    }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
        {METRIC_LABELS[metric]}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, marginTop: 6, letterSpacing: '-0.02em', color: 'var(--color-text)' }}>
        {fmtMetric(metric, value, currency)}
      </div>
      {mom && (
        <div style={{
          fontSize: 11, marginTop: 4, fontWeight: 600,
          color: mom.cls === 'positive' ? 'var(--color-green)' : mom.cls === 'negative' ? 'var(--color-red)' : 'var(--color-text-secondary)'
        }}>
          {mom.arrow} {mom.change > 0 ? '+' : ''}{mom.change.toFixed(1)}% {mom.label}
        </div>
      )}
      {dailyData && dailyData.length >= 2 && (
        <div style={{ marginTop: 8, height: 32 }}>
          <Line
            data={{
              labels: dailyData.map(d => d._date),
              datasets: [{
                data: dailyData.map(d => d[metric] || 0),
                borderColor: color, backgroundColor: color + '20',
                borderWidth: 1.5, fill: true, tension: 0.4, pointRadius: 0
              }]
            }}
            options={{
              responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false }, tooltip: { enabled: false } },
              scales: { x: { display: false }, y: { display: false } },
              layout: { padding: 0 }
            }}
          />
        </div>
      )}
    </div>
  )
})
