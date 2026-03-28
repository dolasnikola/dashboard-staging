// ============== IN-MEMORY CACHE ==============
// Data is prefetched from Supabase into this cache.
// All reads are synchronous (from cache), writes are async (to Supabase).

const CACHE_TTL_MS = 5 * 60 * 1000  // 5 minutes
const MAX_CACHED_CLIENTS = 5         // LRU eviction threshold

export const _cache = {
  clients: null,
  campaignData: {},   // key: `${clientId}_${platform}_${month}` → rows[]
  budgets: {},        // key: `budget_${clientId}_${platform}_${month}` → amount
  flightDays: {},     // key: `flight_${clientId}_${month}` → days[]
  ga4Data: {},        // key: `ga4_${clientId}_${month}` → rows[]
  localDisplay: {},   // key: `ld_${clientId}_${month}` → rows[]
  localDisplayDaily: {}, // key: `ldd_${clientId}_${month}` → rows[] (daily from gDE API)
  sheetLinks: null,   // key → url
  homepageSummary: {},// key: `${clientId}_${platform}_${month}` → {spend,impressions,clicks,conversions}
  _prefetched: {},    // clientId → timestamp (ms) of last prefetch
  _accessOrder: []    // LRU order: most recent at end
}

// ============== TTL & LRU ==============

export function isClientCacheValid(clientId) {
  const ts = _cache._prefetched[clientId]
  if (!ts) return false
  return (Date.now() - ts) < CACHE_TTL_MS
}

export function touchClient(clientId) {
  _cache._prefetched[clientId] = Date.now()
  // Update LRU order
  _cache._accessOrder = _cache._accessOrder.filter(id => id !== clientId)
  _cache._accessOrder.push(clientId)
  // Evict oldest if over limit
  while (_cache._accessOrder.length > MAX_CACHED_CLIENTS) {
    const evictId = _cache._accessOrder.shift()
    clearClientCache(evictId)
  }
}

export function clearClientCache(clientId) {
  const campaignPrefix = `${clientId}_`
  Object.keys(_cache.campaignData).forEach(k => {
    if (k.startsWith(campaignPrefix)) delete _cache.campaignData[k]
  })
  Object.keys(_cache.budgets).forEach(k => {
    if (k.startsWith(`budget_${clientId}_`)) delete _cache.budgets[k]
  })
  Object.keys(_cache.flightDays).forEach(k => {
    if (k.startsWith(`flight_${clientId}_`)) delete _cache.flightDays[k]
  })
  Object.keys(_cache.ga4Data).forEach(k => {
    if (k.startsWith(`ga4_${clientId}_`)) delete _cache.ga4Data[k]
  })
  Object.keys(_cache.localDisplay).forEach(k => {
    if (k.startsWith(`ld_${clientId}_`)) delete _cache.localDisplay[k]
  })
  Object.keys(_cache.localDisplayDaily).forEach(k => {
    if (k.startsWith(`ldd_${clientId}_`)) delete _cache.localDisplayDaily[k]
  })
  delete _cache._prefetched[clientId]
  _cache._accessOrder = _cache._accessOrder.filter(id => id !== clientId)
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

export function dbGetLocalDisplay(clientId, month) {
  return _cache.localDisplay[`ld_${clientId}_${month}`] || []
}

export function dbGetAllLocalDisplay(clientId) {
  const prefix = `ld_${clientId}_`
  let allRows = []
  Object.entries(_cache.localDisplay).forEach(([key, rows]) => {
    if (key.startsWith(prefix)) allRows = allRows.concat(rows)
  })
  return allRows
}

export function dbGetLocalDisplayDaily(clientId, month) {
  return _cache.localDisplayDaily[`ldd_${clientId}_${month}`] || []
}

export function dbGetAllLocalDisplayDaily(clientId) {
  const prefix = `ldd_${clientId}_`
  let allRows = []
  Object.entries(_cache.localDisplayDaily).forEach(([key, rows]) => {
    if (key.startsWith(prefix)) allRows = allRows.concat(rows)
  })
  return allRows
}

export function getHomepageSummary(clientId, platform, month) {
  const key = `${clientId}_${platform}_${month}`
  return _cache.homepageSummary[key] || { spend: 0, impressions: 0, clicks: 0, conversions: 0 }
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
  _cache.localDisplay = {}
  _cache.localDisplayDaily = {}
  _cache.sheetLinks = null
  _cache.homepageSummary = {}
  _cache._prefetched = {}
  _cache._accessOrder = []
}
