// ============== IN-MEMORY CACHE ==============
// Data is prefetched from Supabase into this cache.
// All reads are synchronous (from cache), writes are async (to Supabase).

export const _cache = {
  clients: null,
  campaignData: {},   // key: `${clientId}_${platform}_${month}` → rows[]
  budgets: {},        // key: `budget_${clientId}_${platform}_${month}` → amount
  flightDays: {},     // key: `flight_${clientId}_${month}` → days[]
  ga4Data: {},        // key: `ga4_${clientId}_${month}` → rows[]
  sheetLinks: null,   // key → url
  _prefetched: {}     // tracks which clients have been prefetched
}

// ============== SYNCHRONOUS READS ==============

export function dbGetCampaignData(clientId, platform, month) {
  const key = `${clientId}_${platform}_${month}`
  return _cache.campaignData[key] || []
}

export function dbGetBudget(clientId, platform, month) {
  return _cache.budgets[`budget_${clientId}_${platform}_${month}`] || 0
}

export function dbGetFlightDays(clientId, month) {
  return _cache.flightDays[`flight_${clientId}_${month}`] || []
}

export function dbGetGA4Data() {
  const result = {}
  Object.entries(_cache.ga4Data).forEach(([key, rows]) => {
    const month = key.split('_').slice(2).join('_')
    if (!result[month]) result[month] = []
    result[month] = result[month].concat(rows)
  })
  return result
}

export function dbGetAllCampaignKeys(clientId, platform) {
  const prefix = `${clientId}_${platform}_`
  return Object.keys(_cache.campaignData)
    .filter(k => k.startsWith(prefix))
    .map(k => k.replace(prefix, ''))
}

export function dbGetAllCampaignDataForPlatform(clientId, platform) {
  const prefix = `${clientId}_${platform}_`
  let allRows = []
  Object.entries(_cache.campaignData).forEach(([key, rows]) => {
    if (key.startsWith(prefix)) {
      allRows = allRows.concat(rows)
    }
  })
  return allRows
}

export function getSheetLinks() {
  return _cache.sheetLinks || {}
}

export function clearCache() {
  _cache.clients = null
  _cache.campaignData = {}
  _cache.budgets = {}
  _cache.flightDays = {}
  _cache.ga4Data = {}
  _cache.sheetLinks = null
  _cache._prefetched = {}
}
