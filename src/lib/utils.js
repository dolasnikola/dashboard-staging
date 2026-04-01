import { dbGetCampaignData, dbGetAllCampaignDataForPlatform } from './cache'
import { NLB_PRODUCTS } from './data'

// ============== DATE RANGE ==============

export function getDateRangeBounds(activeDateRange, customDateFrom, customDateTo) {
  const today = new Date()
  const y = today.getFullYear(), m = today.getMonth(), d = today.getDate()
  switch (activeDateRange) {
    case 'this_month':
      return { from: new Date(y, m, 1), to: today, month: `${y}-${String(m + 1).padStart(2, '0')}` }
    case 'last_month': {
      const lm = new Date(y, m - 1, 1)
      const lmEnd = new Date(y, m, 0, 23, 59, 59, 999)
      return { from: lm, to: lmEnd, month: `${lm.getFullYear()}-${String(lm.getMonth() + 1).padStart(2, '0')}` }
    }
    case 'yesterday': {
      const yest = new Date(y, m, d - 1)
      const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`
      return { from: new Date(yestStr), to: new Date(yestStr + 'T23:59:59.999Z'), month: yestStr.slice(0, 7) }
    }
    case 'last_7': {
      const from = new Date(today); from.setDate(d - 6)
      return { from, to: today, month: null }
    }
    case 'last_30': {
      const from = new Date(today); from.setDate(d - 29)
      return { from, to: today, month: null }
    }
    case 'all':
      return { from: new Date(2020, 0, 1), to: today, month: null, allMonths: true }
    case 'custom':
      return { from: customDateFrom ? new Date(customDateFrom) : new Date(y, m, 1), to: customDateTo ? new Date(customDateTo) : today, month: null }
    default:
      return { from: new Date(y, m, 1), to: today, month: `${y}-${String(m + 1).padStart(2, '0')}` }
  }
}

export function getMonthsInRange(from, to) {
  const months = []
  const d = new Date(from.getFullYear(), from.getMonth(), 1)
  while (d <= to) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    d.setMonth(d.getMonth() + 1)
  }
  return months
}

export function getCurrentMonth() {
  return new Date().toISOString().slice(0, 7)
}

export function getFilteredData(clientId, platform, activeDateRange, customDateFrom, customDateTo) {
  const bounds = getDateRangeBounds(activeDateRange, customDateFrom, customDateTo)

  if (bounds.allMonths) {
    return dbGetAllCampaignDataForPlatform(clientId, platform)
  }

  if (bounds.month) {
    let rows = dbGetCampaignData(clientId, platform, bounds.month)
    if (rows.length > 0 && rows[0].date) {
      const fromDate = bounds.from
      const toDate = bounds.to
      rows = rows.filter(r => {
        const rd = new Date(r.date)
        return rd >= fromDate && rd <= toDate
      })
    }
    return rows
  }

  const fromDate = bounds.from
  const toDate = bounds.to
  const months = getMonthsInRange(fromDate, toDate)
  let allRows = []
  months.forEach(m => {
    allRows = allRows.concat(dbGetCampaignData(clientId, platform, m))
  })
  if (allRows.length > 0 && allRows[0].date) {
    allRows = allRows.filter(r => {
      const rd = new Date(r.date)
      return rd >= fromDate && rd <= toDate
    })
  }
  return allRows
}

// ============== AGGREGATION ==============

export function aggregateByCampaign(rows) {
  const map = {}
  rows.forEach(r => {
    const key = r.insertion_order || r.campaign || 'Unknown'
    if (!map[key]) {
      map[key] = { campaign: r.campaign || key, insertion_order: r.insertion_order || '', impressions: 0, clicks: 0, spend: 0, reach: 0, conversions: 0, conv_value: 0 }
    }
    map[key].impressions += r.impressions || 0
    map[key].clicks += r.clicks || 0
    map[key].spend += r.spend || 0
    map[key].reach += r.reach || 0
    map[key].conversions += r.conversions || 0
    map[key].conv_value += r.conv_value || 0
  })
  return Object.values(map).map(r => {
    r.ctr = r.impressions > 0 ? r.clicks / r.impressions * 100 : 0
    r.cpm = r.impressions > 0 ? r.spend / r.impressions * 1000 : 0
    r.cpc = r.clicks > 0 ? r.spend / r.clicks : 0
    r.cpa = r.conversions > 0 ? r.spend / r.conversions : 0
    return r
  })
}

export function groupByProduct(rawRows) {
  const grouped = {}
  Object.keys(NLB_PRODUCTS).forEach(key => { grouped[key] = [] })
  grouped['ostalo'] = []

  rawRows.forEach(r => {
    const name = (r.campaign || '').toLowerCase()
    if (!name.includes('pmax') && !name.includes('search')) return
    let matched = false
    for (const key of Object.keys(NLB_PRODUCTS)) {
      if (name.includes(key)) {
        grouped[key].push(r)
        matched = true
        break
      }
    }
    if (!matched) grouped['ostalo'].push(r)
  })

  Object.keys(grouped).forEach(k => { if (grouped[k].length === 0) delete grouped[k] })
  return grouped
}

// ============== MoM COMPARISON ==============

export function getPrevPeriodBounds(activeDateRange, customDateFrom, customDateTo) {
  const today = new Date()
  const y = today.getFullYear(), mo = today.getMonth(), d = today.getDate()
  switch (activeDateRange) {
    case 'yesterday': {
      const prev = new Date(y, mo, d - 2)
      const prevStr = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(prev.getDate()).padStart(2, '0')}`
      return { from: new Date(prevStr), to: new Date(prevStr + 'T23:59:59.999Z'), label: 'vs prekjuče' }
    }
    case 'last_7': {
      const from = new Date(today); from.setDate(d - 13)
      const to = new Date(today); to.setDate(d - 7)
      return { from, to, label: 'vs prethodnih 7 dana' }
    }
    case 'last_30': {
      const from = new Date(today); from.setDate(d - 59)
      const to = new Date(today); to.setDate(d - 30)
      return { from, to, label: 'vs prethodnih 30 dana' }
    }
    case 'this_month': {
      const from = new Date(y, mo - 1, 1)
      const to = new Date(y, mo, 0)
      return { from, to, label: 'vs prošli mesec' }
    }
    case 'last_month': {
      const from = new Date(y, mo - 2, 1)
      const to = new Date(y, mo - 1, 0)
      return { from, to, label: 'vs mesec pre' }
    }
    case 'custom': {
      if (!customDateFrom || !customDateTo) return null
      const cFrom = new Date(customDateFrom)
      const cTo = new Date(customDateTo)
      const rangeMs = cTo.getTime() - cFrom.getTime()
      const prevTo = new Date(cFrom.getTime() - 86400000)
      const prevFrom = new Date(cFrom.getTime() - rangeMs - 86400000)
      return { from: prevFrom, to: prevTo, label: 'vs prethodni period' }
    }
    default:
      return null
  }
}

export function getDataForRange(clientId, platform, fromDate, toDate) {
  const months = getMonthsInRange(fromDate, toDate)
  let allRows = []
  months.forEach(m => { allRows = allRows.concat(dbGetCampaignData(clientId, platform, m)) })
  if (allRows.length > 0 && allRows[0].date) {
    allRows = allRows.filter(r => { const rd = new Date(r.date); return rd >= fromDate && rd <= toDate })
  }
  return allRows
}

export function getPrevPeriodAgg(clientId, platform, setup, activeDateRange, customDateFrom, customDateTo) {
  const prev = getPrevPeriodBounds(activeDateRange, customDateFrom, customDateTo)
  if (!prev) return { agg: null, label: '' }

  const prevRows = getDataForRange(clientId, platform, prev.from, prev.to)
  if (prevRows.length === 0) return { agg: null, label: prev.label }

  const rows = aggregateByCampaign(prevRows)
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
  if (agg.cpa !== undefined) agg.cpa = agg.conversions > 0 ? agg.spend / agg.conversions : 0
  return { agg, label: prev.label }
}

export function getMoMChange(metric, current, prev, label) {
  if (!prev || prev[metric] === undefined || prev[metric] === 0) return null
  const change = ((current - prev[metric]) / prev[metric]) * 100
  const invertedMetrics = ['cpa', 'cpm', 'cpc']
  const isGood = invertedMetrics.includes(metric) ? change <= 0 : change >= 0
  const cls = Math.abs(change) < 0.5 ? 'neutral' : (isGood ? 'positive' : 'negative')
  const arrow = change > 0 ? '▲' : change < 0 ? '▼' : '–'
  return { change, isGood, cls, arrow, label: label || 'vs prethodni period' }
}

export function getDailyTotals(rawRows, metrics) {
  const dailyMap = {}
  rawRows.forEach(r => {
    const d = (r.date || '').substring(0, 10)
    if (!d) return
    if (!dailyMap[d]) {
      dailyMap[d] = {}
      metrics.forEach(m => dailyMap[d][m] = 0)
    }
    metrics.forEach(m => {
      if (['impressions', 'reach', 'clicks', 'conversions', 'conv_value', 'spend'].includes(m)) {
        dailyMap[d][m] += r[m] || 0
      }
    })
  })
  const sortedDates = Object.keys(dailyMap).sort()
  return sortedDates.map(d => {
    const row = dailyMap[d]
    if (row.cpm !== undefined) row.cpm = row.impressions > 0 ? row.spend / row.impressions * 1000 : 0
    if (row.ctr !== undefined) row.ctr = row.impressions > 0 ? row.clicks / row.impressions * 100 : 0
    if (row.cpc !== undefined) row.cpc = row.clicks > 0 ? row.spend / row.clicks : 0
    if (row.cpa !== undefined) row.cpa = row.conversions > 0 ? row.spend / row.conversions : 0
    row._date = d
    return row
  })
}
