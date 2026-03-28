import { parseCSV, detectPlatform, mapRow, parseNum, PLATFORM_NAMES } from './data'
import { getSheetLinks } from './cache'
import { dbSaveCampaignData, dbSaveGA4Data, dbSaveSheetLinks } from './db'
import { getCurrentMonth } from './utils'

export async function fetchSheetCSV(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return await response.text()
}

export async function syncOneSheet(clientId, platform, onStatus) {
  const links = getSheetLinks()
  const key = `${clientId}_${platform}`
  const url = links[key]

  if (!url) {
    if (onStatus) onStatus(key, 'error', 'Nema linka')
    return
  }

  if (onStatus) onStatus(key, 'loading', '...')

  try {
    const csvText = await fetchSheetCSV(url)
    const { headers, rows } = parseCSV(csvText)
    const detectedPlatform = detectPlatform(headers)
    const mapped = rows.map(r => mapRow(detectedPlatform || platform, r))
      .filter(r => r.campaign && r.campaign !== 'Poslednji update:' && !r.campaign.startsWith('Poslednji'))

    const byMonth = {}
    mapped.forEach(r => {
      let month
      if (r.date) {
        const ds = String(r.date).trim()
        let parsed
        if (ds.includes('/')) {
          const parts = ds.split('/')
          parsed = { y: parts[2], m: parts[0].padStart(2, '0') }
        } else {
          const d = ds.replace(/-/g, '')
          parsed = { y: d.substring(0, 4), m: d.substring(4, 6) }
        }
        month = parsed.y + '-' + parsed.m
        if (ds.includes('/')) {
          const parts = ds.split('/')
          r.date = parts[2] + '-' + parts[0].padStart(2, '0') + '-' + parts[1].padStart(2, '0')
        }
      } else {
        month = getCurrentMonth()
      }
      if (!byMonth[month]) byMonth[month] = []
      byMonth[month].push(r)
    })

    const monthKeys = Object.keys(byMonth)
    for (const m of monthKeys) {
      await dbSaveCampaignData(clientId, platform, m, byMonth[m])
    }

    if (onStatus) onStatus(key, 'success', `${mapped.length} redova (${monthKeys.length} mes.)`)
  } catch (err) {
    const errMsg = err.message || String(err)
    if (onStatus) onStatus(key, 'error', errMsg)
    console.error(`[syncOneSheet] ${key}:`, errMsg)
  }
}

let _syncInProgress = false

export async function syncAllSheets(onProgress, onNotify) {
  if (_syncInProgress) {
    console.log('[syncAllSheets] Sync already in progress, skipping')
    return
  }
  _syncInProgress = true

  const links = getSheetLinks()
  const keys = Object.keys(links).filter(k => links[k] && links[k].includes('/pub') && !links[k].includes('/.../') && !k.endsWith('_ga4'))

  if (keys.length === 0) {
    if (onNotify) onNotify('Nema sačuvanih linkova', 'warning')
    _syncInProgress = false
    return
  }

  let done = 0
  let errors = 0

  for (const key of keys) {
    const firstUnderscore = key.indexOf('_')
    const clientId = key.substring(0, firstUnderscore)
    const platform = key.substring(firstUnderscore + 1)
    try {
      await syncOneSheet(clientId, platform)
    } catch { errors++ }
    done++
    if (onProgress) onProgress(done, keys.length, errors)
  }

  if (onNotify) {
    onNotify(
      errors > 0 ? `Sync završen sa ${errors} grešaka` : 'Svi podaci sinhronizovani!',
      errors > 0 ? 'warning' : 'success'
    )
  }

  _syncInProgress = false
}

export async function syncGA4Sheet(onNotify) {
  const links = getSheetLinks()
  // Find all GA4 sheet links (keys ending with _ga4)
  const ga4Keys = Object.keys(links).filter(k => k.endsWith('_ga4') && links[k])
  if (ga4Keys.length === 0) return

  for (const key of ga4Keys) {
    const clientId = key.replace(/_ga4$/, '')
    const url = links[key]

    try {
      const csvText = await fetchSheetCSV(url)
      const { headers, rows } = parseCSV(csvText)

      const byMonth = {}
      rows.forEach(row => {
        const month = row['Month'] || row['month'] || row['Mesec'] || ''
        if (!month) return
        if (!byMonth[month]) byMonth[month] = []
        byMonth[month].push({
          product: row['Product'] || row['product'] || row['Proizvod'] || '',
          leads: parseNum(row['Leads'] || row['leads'] || 0),
          sessions: parseNum(row['Sessions'] || row['sessions'] || 0),
          users: parseNum(row['Total Users'] || row['Total users'] || row['users'] || row['Users'] || 0)
        })
      })

      for (const [month, data] of Object.entries(byMonth)) {
        await dbSaveGA4Data(clientId, month, data)
      }
    } catch (err) {
      console.error(`[syncGA4Sheet] ${clientId} error:`, err.message || err)
      if (onNotify) onNotify(`GA4 sync greška (${clientId}): ` + (err.message || err), 'warning')
      continue
    }
  }

  if (onNotify) onNotify('GA4 podaci sinhronizovani', 'success')
}

export async function saveSheetLinks(links) {
  await dbSaveSheetLinks(links)
}
