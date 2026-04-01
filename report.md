# Plan: A/B Report — Sheets CSV vs DB Aggregation

## Context
Monthly Krka report currently fetches aggregated CSV data from Google Sheets (written by monthly Apps Scripts). All the same daily data already lives in `campaign_data` table in Supabase. Goal: add a second report generation path that aggregates directly from DB, so we can compare both outputs (A = Sheets, B = DB) for March 2026 and validate before fully migrating.

## Approach
Add a `collectReportDataFromDB()` function alongside existing `collectReportData()`. Add a second button in ClientDetail to generate "DB report". Both produce identical `reportData` structure — same PDF renderer, same AI narratives.

## Files to modify

### 1. `src/reports/generator.js` — New `collectReportDataFromDB()` + new export
**New function** `collectReportDataFromDB(config)`:
- For each platform in `config.platform_labels`:
  - Query `campaign_data` from Supabase: `WHERE client_id = X AND platform = Y AND month = reportMonth`
  - For DV360: apply `config.gdn_campaign_filter` (ILIKE '%Krka Terme%'), aggregate by campaign AND by insertion_order separately
  - For other platforms: aggregate by campaign
  - Calculate CTR, CPM, CPC from aggregated totals
- For `local_display`: query `local_display_dashboard` table instead
- Return same `{ client, clientId, reportMonth, platforms, platformLabels, metricCols, config }` structure

**Reuse existing:**
- `sumTotals()` from `pdf-utils.js` for totals calculation
- `getReportMonth()` for month detection
- `sb` from `src/lib/supabase.js` for queries

**New export:** `generateReportFromDB(clientId, onNotify, onProgress)` — same as `generateReport()` but calls `collectReportDataFromDB()` instead of `collectReportData()`

### 2. `src/components/client/ClientDetail.jsx` — Second button
Add a second button next to "Mesecni izvestaj":
- Label: "Izvestaj (DB)"
- Calls `generateReportFromDB()` instead of `generateReport()`
- Same progress/status pattern
- Only show when `hasReportConfig` is true

### 3. No changes to:
- `pdf-utils.js` — parsers stay for Sheets path, PDF rendering untouched
- `report_configs` table — no schema changes needed
- AI narratives — both paths feed same `reportData` to worker

## DB Aggregation Logic (core of collectReportDataFromDB)

```javascript
async function collectReportDataFromDB(config) {
  const reportMonth = getReportMonth()
  const clientId = config.client_id
  const platformLabels = config.platform_labels || {}
  const platforms = {}

  // Platform mapping: config key → campaign_data platform value
  const PLATFORM_MAP = {
    google_ads: 'google_ads',
    meta: 'meta',
    dv360: 'dv360',
    local_display: 'local_display'
  }

  for (const [platKey, label] of Object.entries(platformLabels)) {
    const dbPlatform = PLATFORM_MAP[platKey]
    if (!dbPlatform) continue

    if (platKey === 'local_display') {
      // Query local_display_dashboard table
      const { data } = await sb.from('local_display_dashboard')
        .select('placement, impressions, clicks, ctr')
        .eq('client_id', clientId)
        .gte('date', `${reportMonth}-01`)
        .lte('date', `${reportMonth}-31`)
      // Aggregate by placement
      ...
      continue
    }

    // Query campaign_data
    let query = sb.from('campaign_data')
      .select('campaign, insertion_order, impressions, clicks, spend, reach')
      .eq('client_id', clientId)
      .eq('platform', dbPlatform)
      .eq('month', reportMonth)

    const { data: rows } = await query

    // DV360: apply campaign filter
    let filtered = rows
    if (platKey === 'dv360' && config.gdn_campaign_filter) {
      filtered = rows.filter(r => r.campaign?.includes(config.gdn_campaign_filter))
    }

    // Aggregate by campaign
    const campaignAgg = aggregateRows(filtered, 'campaign')

    if (platKey === 'dv360') {
      // Also aggregate by insertion_order
      const ioAgg = aggregateRows(filtered, 'insertion_order')
      platforms.dv360 = { campaigns: campaignAgg, insertionOrders: ioAgg, totals: sumTotals(ioAgg) }
    } else {
      platforms[platKey] = { campaigns: campaignAgg, totals: sumTotals(campaignAgg) }
    }
  }

  return { client, clientId, reportMonth, monthLabel, platforms, platformLabels, metricCols, config }
}

// Simple aggregation helper
function aggregateRows(rows, groupByField) {
  const agg = {}
  for (const r of rows) {
    const key = r[groupByField] || ''
    if (!agg[key]) agg[key] = { campaign: key, impressions: 0, clicks: 0, spend: 0, reach: 0 }
    agg[key].impressions += Number(r.impressions) || 0
    agg[key].clicks += Number(r.clicks) || 0
    agg[key].spend += Number(r.spend) || 0
    agg[key].reach += Number(r.reach) || 0
  }
  return Object.values(agg).map(d => ({
    ...d,
    ctr: d.impressions > 0 ? d.clicks / d.impressions * 100 : 0,
    cpm: d.impressions > 0 ? d.spend / d.impressions * 1000 : 0
  })).sort((a, b) => b.impressions - a.impressions)
}
```

## PDF filename differentiation
- Sheets report: `Krka_Terme-Monthly_Report_March_2026.pdf` (unchanged)
- DB report: `Krka_Terme-Monthly_Report_March_2026_DB.pdf` (suffix `_DB`)

This makes it easy to compare both files side by side.

## Verification
1. Generate both reports for Krka, March 2026
2. Compare spend totals: DB report should show Revenue values (€1,000 for Hotel Sport), Sheets report shows whatever is currently in the Sheet
3. Compare campaign names, impressions, clicks — should match
4. Visual comparison of PDFs side by side
5. If DB report matches expectations, plan to deprecate Sheets path in future
