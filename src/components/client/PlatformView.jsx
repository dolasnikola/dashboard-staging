import { useAppStore } from '../../stores/appStore'
import { getFilteredData, aggregateByCampaign, getPrevPeriodAgg, getMoMChange, getDailyTotals, groupByProduct } from '../../lib/utils'
import { PLATFORM_NAMES, METRIC_LABELS, fmtMetric, NLB_PRODUCTS } from '../../lib/data'
import MetricCard from './MetricCard'
import CampaignTable from './CampaignTable'
import ProductsSection from './ProductsSection'
import { Bar } from 'react-chartjs-2'

export default function PlatformView({ clientId, client, platform }) {
  const { activeDateRange, customDateFrom, customDateTo } = useAppStore()
  const setup = client.setup[platform]

  if (!setup) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)', background: 'var(--color-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
        Nema podataka za ovu platformu. Importuj CSV da počneš.
      </div>
    )
  }

  const rawRows = getFilteredData(clientId, platform, activeDateRange, customDateFrom, customDateTo)
  const rows = aggregateByCampaign(rawRows)
  const typeClass = setup.type === 'performance' ? 'type-performance' : setup.type === 'traffic' ? 'type-traffic' : 'type-awareness'

  // Aggregate metrics
  const agg = {}
  setup.metrics.forEach(m => agg[m] = 0)
  rows.forEach(r => {
    if (agg.impressions !== undefined) agg.impressions += r.impressions || 0
    if (agg.reach !== undefined) agg.reach += r.reach || 0
    if (agg.clicks !== undefined) agg.clicks += r.clicks || 0
    if (agg.conversions !== undefined) agg.conversions += r.conversions || 0
    if (agg.conv_value !== undefined) agg.conv_value += r.conv_value || 0
    if (agg.spend !== undefined) agg.spend += r.spend || 0
  })
  if (agg.cpm !== undefined) agg.cpm = agg.impressions > 0 ? agg.spend / agg.impressions * 1000 : 0
  if (agg.ctr !== undefined) agg.ctr = agg.impressions > 0 ? agg.clicks / agg.impressions * 100 : 0
  if (agg.cpc !== undefined) agg.cpc = agg.clicks > 0 ? agg.spend / agg.clicks : 0
  if (agg.cpa !== undefined) {
    const pmaxRows = rows.filter(r => r.campaign && /pmax|performance.?max/i.test(r.campaign))
    if (pmaxRows.length > 0) {
      const pmaxConv = pmaxRows.reduce((s, r) => s + (r.conversions || 0), 0)
      const pmaxSpend = pmaxRows.reduce((s, r) => s + (r.spend || 0), 0)
      agg.cpa = pmaxConv > 0 ? pmaxSpend / pmaxConv : 0
    } else {
      agg.cpa = agg.conversions > 0 ? agg.spend / agg.conversions : 0
    }
  }

  // MoM
  const { agg: prevAgg, label: prevLabel } = getPrevPeriodAgg(clientId, platform, setup, activeDateRange, customDateFrom, customDateTo)

  // Daily data for sparklines
  const dailyData = getDailyTotals(rawRows, setup.metrics)

  // Campaign table columns
  const hasDV360IO = platform === 'dv360' && rows.some(r => r.insertion_order)
  const tableCols = hasDV360IO ? ['campaign', 'insertion_order', ...setup.metrics] : ['campaign', ...setup.metrics]

  // Chart data
  const chartLabels = rows.map(r => r.campaign?.length > 30 ? r.campaign.substring(0, 30) + '...' : r.campaign)
  const colors = ['#4a6cf7', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
  const metricKey = setup.type === 'performance' ? 'conversions' : setup.type === 'traffic' ? 'clicks' : 'impressions'

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 400, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 10 }}>
        {PLATFORM_NAMES[platform]} <span className={`campaign-type ${typeClass}`}>{setup.label}</span>
      </div>

      {/* Metric cards with sparklines */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16, marginBottom: 24 }}>
        {setup.metrics.map((m, i) => (
          <MetricCard
            key={m}
            metric={m}
            value={agg[m]}
            currency={client.currency}
            mom={getMoMChange(m, agg[m], prevAgg, prevLabel)}
            dailyData={dailyData}
            index={i}
          />
        ))}
      </div>

      {/* NLB Products section */}
      {clientId === 'nlb' && platform === 'google_ads' && rawRows.length > 0 && (
        <ProductsSection rawRows={rawRows} currency={client.currency} />
      )}

      {/* Charts */}
      {rows.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 24 }}>
          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>Spend po kampanjama</div>
            <div style={{ position: 'relative', height: 280 }}>
              <Bar
                data={{ labels: chartLabels, datasets: [{ label: 'Spend', data: rows.map(r => r.spend), backgroundColor: colors.slice(0, rows.length), borderRadius: 6 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
              />
            </div>
          </div>
          <div style={{ background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-default)', padding: 22, boxShadow: 'var(--shadow-default)' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 400, marginBottom: 16 }}>
              {setup.type === 'performance' ? 'Conversions' : setup.type === 'traffic' ? 'Clicks' : 'Impressions'} po kampanjama
            </div>
            <div style={{ position: 'relative', height: 280 }}>
              <Bar
                data={{ labels: chartLabels, datasets: [{ label: METRIC_LABELS[metricKey], data: rows.map(r => r[metricKey]), backgroundColor: colors.slice(0, rows.length), borderRadius: 6 }] }}
                options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Campaign table */}
      {rows.length > 0 ? (
        <CampaignTable rows={rows} columns={tableCols} currency={client.currency} />
      ) : (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-secondary)', background: 'var(--color-card)', borderRadius: 12, border: '1px solid var(--color-border)' }}>
          Nema podataka. Importuj CSV za {PLATFORM_NAMES[platform]}.
        </div>
      )}
    </div>
  )
}
