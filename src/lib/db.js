import { sb } from './supabase'
import { _cache, dbGetCampaignData, isClientCacheValid, touchClient, clearClientCache } from './cache'

// ============== CLIENTS ==============

export async function fetchClients() {
  const { data, error } = await sb.from('clients').select('*').order('name', { ascending: true })

  if (error) {
    console.error('[fetchClients] error:', error.message)
    return {}
  }

  const clients = {}
  data.forEach(row => {
    clients[row.id] = {
      name: row.name,
      currency: row.currency,
      status: row.status,
      statusLabel: row.status_label,
      defaultPlatform: row.default_platform,
      platforms: row.platforms,
      tiktok: row.tiktok,
      setup: row.setup,
      budgetNote: row.budget_note,
      sortOrder: row.sort_order
    }
  })

  _cache.clients = clients
  return clients
}

// ============== PREFETCH ==============

const _prefetchInProgress = {}

export async function prefetchClientData(clientId) {
  if (_prefetchInProgress[clientId]) {
    // Already in progress for this client, skip
    return
  }
  // Skip if cache is still fresh (TTL not expired)
  if (isClientCacheValid(clientId)) {
    touchClient(clientId) // refresh LRU position
    return
  }
  _prefetchInProgress[clientId] = true

  try {
    const allCampaignRows = []
    let from = 0
    const pageSize = 1000
    while (true) {
      const { data, error } = await sb.from('campaign_data')
        .select('*')
        .eq('client_id', clientId)
        .order('date', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error || !data || data.length === 0) break
      allCampaignRows.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }

    const [budgetRes, flightRes, ga4Res, ldRes, lddRes] = await Promise.all([
      sb.from('budgets').select('*').eq('client_id', clientId),
      sb.from('flight_days').select('*').eq('client_id', clientId),
      sb.from('ga4_kpi_data').select('*').eq('client_id', clientId),
      sb.from('local_display_report').select('*').eq('client_id', clientId),
      sb.from('local_display_dashboard').select('*').eq('client_id', clientId).order('date', { ascending: true })
    ])

    // Clear old cache for this client, then repopulate
    clearClientCache(clientId)

    // Populate cache
    allCampaignRows.forEach(row => {
      const key = `${clientId}_${row.platform}_${row.month}`
      if (!_cache.campaignData[key]) _cache.campaignData[key] = []
      _cache.campaignData[key].push({
        campaign: row.campaign,
        insertion_order: row.insertion_order || '',
        date: row.date,
        impressions: Number(row.impressions) || 0,
        clicks: Number(row.clicks) || 0,
        spend: Number(row.spend) || 0,
        reach: Number(row.reach) || 0,
        conversions: Number(row.conversions) || 0,
        conv_value: Number(row.conv_value) || 0,
        ctr: Number(row.ctr) || 0,
        cpm: Number(row.cpm) || 0,
        cpc: Number(row.cpc) || 0,
        cpa: Number(row.cpa) || 0
      })
    })

    if (budgetRes.data) {
      budgetRes.data.forEach(row => {
        _cache.budgets[`budget_${clientId}_${row.platform}_${row.month}`] = Number(row.amount) || 0
      })
    }

    if (flightRes.data) {
      flightRes.data.forEach(row => {
        _cache.flightDays[`flight_${clientId}_${row.month}`] = row.days || []
      })
    }

    if (ga4Res.data) {
      ga4Res.data.forEach(row => {
        const key = `ga4_${clientId}_${row.month}`
        if (!_cache.ga4Data[key]) _cache.ga4Data[key] = []
        _cache.ga4Data[key].push({
          product: row.product,
          leads: Number(row.leads) || 0,
          sessions: Number(row.sessions) || 0,
          users: Number(row.users) || 0
        })
      })
    }

    if (ldRes.data) {
      ldRes.data.forEach(row => {
        const key = `ld_${clientId}_${row.month}`
        if (!_cache.localDisplay[key]) _cache.localDisplay[key] = []
        _cache.localDisplay[key].push({
          campaign: row.campaign,
          month: row.month,
          publisher: row.publisher,
          format: row.format,
          type: row.type,
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          ctr: Number(row.ctr) || 0,
          actions: Number(row.actions) || 0
        })
      })
    }

    if (lddRes.data) {
      lddRes.data.forEach(row => {
        const key = `ldd_${clientId}_${row.month}`
        if (!_cache.localDisplayDaily[key]) _cache.localDisplayDaily[key] = []
        _cache.localDisplayDaily[key].push({
          campaign: row.campaign,
          date: row.date,
          month: row.month,
          publisher: row.publisher,
          format: row.format,
          type: row.type,
          impressions: Number(row.impressions) || 0,
          clicks: Number(row.clicks) || 0,
          ctr: Number(row.ctr) || 0,
          actions: Number(row.actions) || 0,
          spend: Number(row.spend) || 0
        })
      })
    }

    touchClient(clientId)
  } finally {
    delete _prefetchInProgress[clientId]
  }
}

export async function fetchHomepageSummary(month) {
  const { data, error } = await sb.rpc('get_homepage_summary', { p_month: month })
  if (error) {
    console.error('[fetchHomepageSummary] error:', error.message)
    return
  }

  const newSummary = {}
  ;(data || []).forEach(row => {
    const key = `${row.client_id}_${row.platform}_${month}`
    newSummary[key] = {
      spend: row.total_spend || 0,
      impressions: row.total_impressions || 0,
      clicks: row.total_clicks || 0,
      conversions: row.total_conversions || 0
    }
  })

  const [budgetRes, flightRes] = await Promise.all([
    sb.from('budgets').select('*'),
    sb.from('flight_days').select('*').eq('month', month)
  ])
  if (budgetRes.error) console.error('[fetchHomepageSummary] budgets error:', budgetRes.error.message)
  if (flightRes.error) console.error('[fetchHomepageSummary] flight_days error:', flightRes.error.message)

  // Only update cache after all queries succeed
  _cache.homepageSummary = newSummary
  if (budgetRes.data) {
    budgetRes.data.forEach(row => {
      _cache.budgets[`budget_${row.client_id}_${row.platform}_${row.month}`] = Number(row.amount) || 0
    })
  }
  if (flightRes.data) {
    flightRes.data.forEach(row => {
      _cache.flightDays[`flight_${row.client_id}_${row.month}`] = row.days || []
    })
  }
}

// ============== CAMPAIGN DATA (write) ==============

export async function dbSaveCampaignData(clientId, platform, month, rows) {
  const key = `${clientId}_${platform}_${month}`

  const deduped = {}
  rows.forEach(r => {
    const date = r.date || ''
    const campaign = r.campaign || 'Unknown'
    const io = r.insertion_order || ''
    const dedupKey = `${date}|${campaign}|${io}`
    if (!deduped[dedupKey]) {
      deduped[dedupKey] = {
        date: date || null, campaign, insertion_order: io,
        impressions: 0, clicks: 0, spend: 0, reach: 0,
        conversions: 0, conv_value: 0, ctr: 0, cpm: 0, cpc: 0, cpa: 0
      }
    }
    const d = deduped[dedupKey]
    d.impressions += r.impressions || 0
    d.clicks += r.clicks || 0
    d.spend += r.spend || 0
    d.reach += r.reach || 0
    d.conversions += r.conversions || 0
    d.conv_value += r.conv_value || 0
  })
  Object.values(deduped).forEach(d => {
    d.ctr = d.impressions > 0 ? d.clicks / d.impressions * 100 : 0
    d.cpm = d.impressions > 0 ? d.spend / d.impressions * 1000 : 0
    d.cpc = d.clicks > 0 ? d.spend / d.clicks : 0
    d.cpa = d.conversions > 0 ? d.spend / d.conversions : 0
  })
  const cleanRows = Object.values(deduped)

  _cache.campaignData[key] = cleanRows

  const records = cleanRows.map(r => ({ client_id: clientId, platform, month, ...r }))

  const { error: delError } = await sb.from('campaign_data')
    .delete().eq('client_id', clientId).eq('platform', platform).eq('month', month)
  if (delError) {
    console.error('[dbSave] DELETE error:', delError.message)
    return
  }

  if (records.length > 0) {
    for (let i = 0; i < records.length; i += 500) {
      const batch = records.slice(i, i + 500)
      const { error } = await sb.from('campaign_data').insert(batch)
      if (error) {
        console.error('[dbSave] INSERT error for', key, ':', error.message)
        break
      }
    }
  }
}

// ============== BUDGETS (write) ==============

export async function dbSetBudget(clientId, platform, month, amount) {
  _cache.budgets[`budget_${clientId}_${platform}_${month}`] = amount
  const { error } = await sb.from('budgets').upsert({
    client_id: clientId, platform, month, amount,
    updated_at: new Date().toISOString()
  }, { onConflict: 'client_id,platform,month' })
  if (error) console.error('Upsert budget error:', error)
}

// ============== FLIGHT DAYS (write) ==============

export async function dbSetFlightDays(clientId, month, days) {
  _cache.flightDays[`flight_${clientId}_${month}`] = days
  const { error } = await sb.from('flight_days').upsert({
    client_id: clientId, month, days
  }, { onConflict: 'client_id,month' })
  if (error) console.error('Upsert flight_days error:', error)
}

// ============== GA4 KPI DATA (write) ==============

export async function dbSaveGA4Data(clientId, month, rows) {
  const key = `ga4_${clientId}_${month}`
  _cache.ga4Data[key] = rows

  const { error: delError } = await sb.from('ga4_kpi_data').delete().eq('client_id', clientId).eq('month', month)
  if (delError) {
    console.error('[dbSaveGA4Data] DELETE error:', delError.message)
    return
  }
  if (rows.length > 0) {
    const records = rows.map(r => ({
      client_id: clientId, month,
      product: r.product, leads: r.leads || 0, sessions: r.sessions || 0, users: r.users || 0
    }))
    const { error } = await sb.from('ga4_kpi_data').upsert(records, { onConflict: 'client_id,month,product' })
    if (error) console.error('[dbSave] GA4 upsert error:', error.message)
  }
}

// ============== CLIENT MANAGEMENT (FAZA 4A) ==============

export async function dbCreateClient(clientData) {
  const record = {
    id: clientData.id,
    name: clientData.name,
    currency: clientData.currency || 'EUR',
    status: clientData.status || 'active',
    status_label: clientData.statusLabel || 'Aktivna kampanja',
    default_platform: clientData.defaultPlatform || clientData.platforms?.[0] || 'google_ads',
    platforms: clientData.platforms || [],
    tiktok: clientData.platforms?.includes('tiktok') || false,
    setup: clientData.setup || {},
    budget_note: clientData.budgetNote || '',
    sort_order: clientData.sortOrder ?? 100
  }
  const { error } = await sb.from('clients').insert(record)
  if (error) { console.error('[dbCreateClient]', error.message); return false }
  return true
}

export async function dbUpdateClient(clientId, updates) {
  const record = {}
  if (updates.name !== undefined) record.name = updates.name
  if (updates.currency !== undefined) record.currency = updates.currency
  if (updates.status !== undefined) record.status = updates.status
  if (updates.statusLabel !== undefined) record.status_label = updates.statusLabel
  if (updates.defaultPlatform !== undefined) record.default_platform = updates.defaultPlatform
  if (updates.platforms !== undefined) {
    record.platforms = updates.platforms
    record.tiktok = updates.platforms.includes('tiktok')
  }
  if (updates.setup !== undefined) record.setup = updates.setup
  if (updates.budgetNote !== undefined) record.budget_note = updates.budgetNote
  if (updates.sortOrder !== undefined) record.sort_order = updates.sortOrder
  const { error } = await sb.from('clients').update(record).eq('id', clientId)
  if (error) { console.error('[dbUpdateClient]', error.message); return false }
  return true
}

export async function dbDeleteClient(clientId) {
  const relatedTables = ['sheet_links', 'budgets', 'flight_days', 'ga4_kpi_data', 'campaign_data', 'user_client_access', 'report_history', 'report_configs']
  for (const table of relatedTables) {
    const { error } = await sb.from(table).delete().eq('client_id', clientId)
    if (error) { console.error(`[dbDeleteClient] ${table} delete error:`, error.message); return false }
  }
  const { error } = await sb.from('clients').delete().eq('id', clientId)
  if (error) { console.error('[dbDeleteClient]', error.message); return false }
  return true
}

// ============== REPORT CONFIG (FAZA 4B) ==============

export async function dbGetAllReportConfigs() {
  const { data, error } = await sb.from('report_configs').select('*').eq('is_active', true)
  if (error) { console.error('[dbGetAllReportConfigs]', error.message); return [] }
  return data || []
}

export async function dbSaveReportConfig(config) {
  if (config.id) {
    const { id, ...updates } = config
    updates.updated_at = new Date().toISOString()
    const { error } = await sb.from('report_configs').update(updates).eq('id', id)
    if (error) { console.error('[dbSaveReportConfig]', error.message); return false }
    return true
  }
  const { error } = await sb.from('report_configs').insert(config)
  if (error) { console.error('[dbSaveReportConfig]', error.message); return false }
  return true
}

export async function dbDeleteReportConfig(configId) {
  const { error } = await sb.from('report_configs').delete().eq('id', configId)
  if (error) { console.error('[dbDeleteReportConfig]', error.message); return false }
  return true
}

export async function dbGetReportHistory(clientId) {
  const { data, error } = await sb.from('report_history')
    .select('*').eq('client_id', clientId).order('generated_at', { ascending: false }).limit(20)
  if (error) { console.error('[dbGetReportHistory]', error.message); return [] }
  return data || []
}

// ============== SHEET LINKS ==============

export async function dbGetSheetLinks() {
  if (_cache.sheetLinks) return _cache.sheetLinks
  const { data, error } = await sb.from('sheet_links').select('*')
  if (error) { console.error('fetchSheetLinks error:', error); return {} }
  const links = {};
  (data || []).forEach(row => {
    links[`${row.client_id}_${row.platform}`] = row.sheet_url
  })
  _cache.sheetLinks = links
  return links
}

export async function dbSaveSheetLinks(links) {
  _cache.sheetLinks = links
  const records = Object.entries(links).map(([key, url]) => {
    const firstUnderscore = key.indexOf('_')
    return {
      client_id: key.substring(0, firstUnderscore),
      platform: key.substring(firstUnderscore + 1),
      sheet_url: url, is_default: false
    }
  })
  for (const rec of records) {
    const { error } = await sb.from('sheet_links').upsert(rec, { onConflict: 'client_id,platform' })
    if (error) console.error('Upsert sheet_link error:', error)
  }
}

// ============== SYNC LOG ==============

export async function dbGetLastSync() {
  const { data, error } = await sb.from('sync_log')
    .select('*').order('started_at', { ascending: false }).limit(1).single()
  if (error) { console.log('[dbGetLastSync] No sync log yet:', error.message); return null }
  return data
}

// ============== ALERTS ==============

export async function fetchAlerts() {
  const { data, error } = await sb
    .from('alerts')
    .select('*')
    .eq('is_dismissed', false)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) { console.error('[fetchAlerts]', error.message); return }
  _cache.alerts = data || []
}

export async function markAlertRead(alertId) {
  const { error } = await sb.from('alerts').update({ is_read: true }).eq('id', alertId)
  if (error) { console.error('[markAlertRead]', error.message); return }
  const alert = _cache.alerts.find(a => a.id === alertId)
  if (alert) alert.is_read = true
}

export async function markAllAlertsRead() {
  const unread = (_cache.alerts || []).filter(a => !a.is_read)
  if (unread.length === 0) return
  const ids = unread.map(a => a.id)
  const { error } = await sb.from('alerts').update({ is_read: true }).in('id', ids)
  if (error) { console.error('[markAllAlertsRead]', error.message); return }
  unread.forEach(a => { a.is_read = true })
}

export async function dismissAlert(alertId) {
  const { error } = await sb.from('alerts').update({ is_dismissed: true }).eq('id', alertId)
  if (error) { console.error('[dismissAlert]', error.message); return }
  _cache.alerts = (_cache.alerts || []).filter(a => a.id !== alertId)
}

// ============== ADMIN ==============

export async function dbGetAllUsers() {
  const { data, error } = await sb.from('user_profiles').select('*').order('created_at', { ascending: true })
  if (error) { console.error('[dbGetAllUsers]', error.message); return [] }
  return data || []
}

export async function dbGetAllClientAccess() {
  const { data, error } = await sb.from('user_client_access').select('*')
  if (error) { console.error('[dbGetAllClientAccess]', error.message); return [] }
  return data || []
}

export async function dbUpdateUserRole(userId, newRole) {
  const { error } = await sb.from('user_profiles').update({ role: newRole }).eq('id', userId)
  if (error) { console.error('[dbUpdateUserRole]', error.message); return false }
  return true
}

export async function dbSetClientAccess(userId, clientId, grant) {
  if (grant) {
    const { error } = await sb.from('user_client_access').upsert({ user_id: userId, client_id: clientId })
    if (error) { console.error('[dbSetClientAccess] grant error:', error.message); return false }
  } else {
    const { error } = await sb.from('user_client_access').delete().eq('user_id', userId).eq('client_id', clientId)
    if (error) { console.error('[dbSetClientAccess] revoke error:', error.message); return false }
  }
  return true
}

// ============== DIAGNOSTICS ==============

export async function runDiagnostics() {
  const results = {}
  console.log('%c[Diagnostics] Pokrećem dijagnostiku...', 'color:#4a6cf7;font-weight:bold;')

  results.protocol = location.protocol
  results.httpsOk = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'

  try {
    const { data: { session }, error } = await sb.auth.getSession()
    results.session = session ? { userId: session.user.id, email: session.user.email } : null
    results.sessionError = error?.message || null
  } catch (e) { results.session = null; results.sessionError = e.message }

  const tables = ['clients', 'campaign_data', 'budgets', 'sheet_links', 'ga4_kpi_data']
  results.tables = {}
  for (const table of tables) {
    try {
      const { error, count } = await sb.from(table).select('*', { count: 'exact', head: true })
      results.tables[table] = { count, error: error?.message || null }
    } catch (e) { results.tables[table] = { count: 0, error: e.message } }
  }

  results.cache = {
    clients: _cache.clients ? Object.keys(_cache.clients).length + ' klijenata' : 'prazan',
    campaignData: Object.keys(_cache.campaignData).length + ' ključeva',
    budgets: Object.keys(_cache.budgets).length + ' zapisa',
    sheetLinks: _cache.sheetLinks ? Object.keys(_cache.sheetLinks).length + ' linkova' : 'prazan'
  }

  console.log('%c[Diagnostics] Rezultati:', 'color:#4a6cf7;font-weight:bold;')
  console.table(results.tables)
  console.log('Cache:', results.cache)
  return results
}

// Expose to window for console debugging
if (typeof window !== 'undefined') {
  window.runDiagnostics = runDiagnostics
}
