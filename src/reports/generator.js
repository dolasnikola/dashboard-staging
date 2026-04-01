import { jsPDF } from 'jspdf'
import { applyPlugin } from 'jspdf-autotable'
applyPlugin(jsPDF)
import { registerFonts } from './fonts/register'
import { useAppStore } from '../stores/appStore'
import { sb } from '../lib/supabase'
import {
  toAscii, fmtNum, fmtEur, fmtTableVal, getReportMonth, getMonthLabelCapital, getMonthNameEn,
  fetchCSV, parseSearchData, parseMetaData, parseGDNData, parseLocalDisplayData, sumTotals,
  pdfDrawBg, pdfRenderTable, preloadCreatives, getCreativeBase64, getImgFormat,
  REPORT_COL_LABELS
} from './pdf-utils'

// ============== FETCH REPORT CONFIG FROM DB ==============
export async function fetchReportConfig(clientId) {
  const { data, error } = await sb.from('report_configs')
    .select('*')
    .eq('client_id', clientId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()
  if (error) { console.error('[fetchReportConfig]', error.message); return null }
  return data
}

// ============== DATA COLLECTION ==============
async function collectReportData(config) {
  const clients = useAppStore.getState().clients
  const client = clients[config.client_id]
  const reportMonth = getReportMonth()
  const urls = config.sheet_urls || {}
  const platformLabels = config.platform_labels || {}
  const metricCols = config.metric_cols || {}

  const platforms = {}

  // Fetch and parse each platform's data
  if (urls.search) {
    const rows = await fetchCSV(urls.search)
    const data = parseSearchData(rows)
    platforms.google_ads = { campaigns: data, totals: sumTotals(data) }
  }

  if (urls.meta) {
    const rows = await fetchCSV(urls.meta)
    const data = parseMetaData(rows)
    platforms.meta = { campaigns: data, totals: sumTotals(data) }
  }

  if (urls.gdn) {
    const rows = await fetchCSV(urls.gdn)
    const data = parseGDNData(rows, config.gdn_campaign_filter)
    const totalSource = data.insertionOrders.length > 0 ? data.insertionOrders : data.campaigns
    platforms.dv360 = { campaigns: data.campaigns, insertionOrders: data.insertionOrders, totals: sumTotals(totalSource) }
  }

  if (urls.local_display) {
    const rows = await fetchCSV(urls.local_display)
    const data = parseLocalDisplayData(rows)
    platforms.local_display = { campaigns: data, totals: sumTotals(data) }
  }

  return {
    client,
    clientId: config.client_id,
    reportMonth,
    monthLabel: getMonthLabelCapital(reportMonth),
    platforms,
    platformLabels,
    metricCols,
    config
  }
}

// ============== TEXT GENERATION (FALLBACK) ==============
function generateExecutiveSummary(reportData) {
  const platformKeys = Object.keys(reportData.platforms)
  const channelNames = platformKeys.map(p => reportData.platformLabels[p] || p)
  const numWord = ['', 'jedan', 'dva', 'tri', 'cetiri', 'pet'][platformKeys.length] || platformKeys.length

  let text = `U ${reportData.monthLabel.toLowerCase()}u je digitalno oglašavanje realizovano kroz ${numWord} ključna kanala komunikacije:\n\n`
  channelNames.forEach(n => { text += `- ${n}\n` })
  text += '\n'

  platformKeys.forEach(platform => {
    const data = reportData.platforms[platform]
    const name = reportData.platformLabels[platform] || platform
    const t = data.totals
    text += `${name} kampanje ostvarile su ${fmtNum(t.reach)} dosegnutih korisnika i ${fmtNum(t.impressions)} impresija, uz ${fmtNum(t.clicks)} klikova sa CTR-om od ${t.ctr.toFixed(2)}% i ukupnim ulaganjem od ${fmtEur(t.spend)}.\n`
  })

  let totalSpend = 0
  platformKeys.forEach(p => { totalSpend += reportData.platforms[p].totals.spend || 0 })
  text += `\nKombinovano, svi kanali su obezbedili balans između volumena, vidljivosti i relevantnog saobraćaja, uz ukupno ulaganje od ${fmtEur(totalSpend)}.`

  return text
}

function generatePlatformNarrative(platform, data, reportData) {
  const name = reportData.platformLabels[platform] || platform
  const t = data.totals
  const campaigns = platform === 'dv360' && data.insertionOrders?.length > 0
    ? data.insertionOrders : data.campaigns

  let text = `Kampanje na ${name} platformi tokom ${reportData.monthLabel.toLowerCase()}a ostvarile su stabilne rezultate, sa ukupno ${fmtNum(t.reach)} dosegnutih korisnika i ${fmtNum(t.impressions)} impresija, čime je obezbeđeno snažno prisustvo brenda.`

  if (campaigns.length > 1) {
    const sorted = [...campaigns].sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    const top = sorted[0]
    text += `\n${top.campaign} imala je ključnu ulogu sa ${fmtNum(top.impressions)} impresija i ${fmtNum(top.clicks)} klikova.`
    const bestCtr = [...campaigns].sort((a, b) => (b.ctr || 0) - (a.ctr || 0))[0]
    if (bestCtr.campaign !== top.campaign && bestCtr.ctr > 0) {
      text += ` Kampanja "${bestCtr.campaign}" se izdvaja sa najvišim CTR-om od ${bestCtr.ctr.toFixed(2)}%.`
    }
  }

  text += `\nUkupno je ostvareno ${fmtNum(t.clicks)} klikova, uz prosečan CTR od ${t.ctr.toFixed(2)}%.`
  text += `\nSa ukupnim ulaganjem od ${fmtEur(t.spend)}, kampanje su nesmetano emitovane tokom ${reportData.monthLabel.toLowerCase()}a.`

  return text
}

// ============== AI NARRATIVES ==============
async function fetchAINarratives(reportData) {
  const workerUrl = reportData.config.ai_worker_url
  if (!workerUrl) { console.warn('[AI] No worker URL configured, skipping AI'); return null }
  try {
    const hostname = new URL(workerUrl).hostname
    if (!hostname.endsWith('.workers.dev') && !hostname.endsWith('.cloudflare.com')) {
      console.warn('[AI] Worker URL domain not allowed:', hostname); return null
    }
  } catch { console.warn('[AI] Invalid worker URL'); return null }

  const cacheKey = `reportNarrative_${reportData.clientId}_${reportData.reportMonth}`
  const platformKeys = Object.keys(reportData.platforms)

  // Check localStorage cache — validate it has executiveSummary + at least one platform key
  try {
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const parsed = JSON.parse(cached)
      const hasAllKeys = parsed.executiveSummary && parsed.executiveSummary.length > 20 &&
        platformKeys.some(k => parsed[k] && parsed[k].length > 20)
      if (hasAllKeys) {
        console.log('[AI] Using cached narratives from localStorage')
        return parsed
      } else {
        console.warn('[AI] Cached narratives incomplete, removing cache')
        localStorage.removeItem(cacheKey)
      }
    }
  } catch (e) { localStorage.removeItem(cacheKey) }

  // Fetch from AI worker with 90s timeout + 1 retry (Supabase historical fetch + Claude API)
  const payload = {
    clientId: reportData.clientId,
    clientName: reportData.client?.name || reportData.clientId,
    promptContext: reportData.config.ai_prompt_context || '',
    reportMonth: reportData.reportMonth,
    reportData: {
      monthLabel: reportData.monthLabel,
      platforms: Object.fromEntries(
        Object.entries(reportData.platforms).map(([key, val]) => [key, {
          label: reportData.platformLabels[key] || key,
          campaigns: val.campaigns,
          insertionOrders: val.insertionOrders || [],
          totals: val.totals
        }])
      )
    }
  }

  const MAX_RETRIES = 1
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`[AI] Calling worker (attempt ${attempt + 1}):`, workerUrl)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 90000)

      const response = await fetch(workerUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        const errBody = await response.text().catch(() => 'no body')
        console.warn(`[AI] Worker error ${response.status}:`, errBody)
        if (attempt < MAX_RETRIES) { console.log('[AI] Retrying...'); continue }
        return null
      }
      const data = await response.json()
      console.log('[AI] Narratives received successfully')
      try { localStorage.setItem(cacheKey, JSON.stringify(data.narratives)) } catch(e) {}
      return data.narratives
    } catch (err) {
      if (err.name === 'AbortError') {
        console.warn(`[AI] Worker request timed out after 90s (attempt ${attempt + 1})`)
      } else {
        console.error('[AI] Failed to fetch narratives:', err)
      }
      if (attempt < MAX_RETRIES) { console.log('[AI] Retrying...'); continue }
      return null
    }
  }
  return null
}

// ============== DB-BASED DATA COLLECTION ==============
async function collectReportDataFromDB(config) {
  const clients = useAppStore.getState().clients
  const client = clients[config.client_id]
  const reportMonth = getReportMonth()
  const platformLabels = config.platform_labels || {}
  const metricCols = config.metric_cols || {}

  const PLATFORM_MAP = {
    google_ads: 'google_ads',
    meta: 'meta',
    dv360: 'dv360'
  }

  const platforms = {}

  for (const [platKey, label] of Object.entries(platformLabels)) {
    if (platKey === 'local_display') {
      // Query local_display_dashboard table
      const { data, error } = await sb.from('local_display_dashboard')
        .select('placement, impressions, clicks, ctr')
        .eq('client_id', config.client_id)
        .gte('date', `${reportMonth}-01`)
        .lte('date', `${reportMonth}-31`)
      if (error) { console.error('[DB Report] local_display error:', error.message); continue }

      const placementAgg = {}
      for (const r of (data || [])) {
        const key = r.placement || ''
        if (!placementAgg[key]) placementAgg[key] = { campaign: key, impressions: 0, clicks: 0, spend: 0 }
        placementAgg[key].impressions += Number(r.impressions) || 0
        placementAgg[key].clicks += Number(r.clicks) || 0
      }
      const ldCampaigns = Object.values(placementAgg).map(d => ({
        ...d,
        ctr: d.impressions > 0 ? d.clicks / d.impressions * 100 : 0
      })).sort((a, b) => b.impressions - a.impressions)

      platforms.local_display = { campaigns: ldCampaigns, totals: sumTotals(ldCampaigns) }
      continue
    }

    const dbPlatform = PLATFORM_MAP[platKey]
    if (!dbPlatform) continue

    // Paginated fetch (Supabase default limit 1000)
    let allRows = []
    let from = 0
    const PAGE_SIZE = 1000
    while (true) {
      const { data, error } = await sb.from('campaign_data')
        .select('campaign, insertion_order, impressions, clicks, spend, reach')
        .eq('client_id', config.client_id)
        .eq('platform', dbPlatform)
        .eq('month', reportMonth)
        .range(from, from + PAGE_SIZE - 1)
      if (error) { console.error(`[DB Report] ${platKey} error:`, error.message); break }
      allRows = allRows.concat(data || [])
      if (!data || data.length < PAGE_SIZE) break
      from += PAGE_SIZE
    }

    // DV360: apply campaign filter
    let filtered = allRows
    if (platKey === 'dv360' && config.gdn_campaign_filter) {
      filtered = allRows.filter(r => r.campaign && r.campaign.indexOf(config.gdn_campaign_filter) !== -1)
    }

    // Aggregate by campaign
    const campaignAgg = aggregateDBRows(filtered, 'campaign')

    if (platKey === 'dv360') {
      const ioAgg = aggregateDBRows(filtered, 'insertion_order')
      const totalSource = ioAgg.length > 0 ? ioAgg : campaignAgg
      platforms.dv360 = { campaigns: campaignAgg, insertionOrders: ioAgg, totals: sumTotals(totalSource) }
    } else {
      platforms[platKey] = { campaigns: campaignAgg, totals: sumTotals(campaignAgg) }
    }
  }

  return {
    client,
    clientId: config.client_id,
    reportMonth,
    monthLabel: getMonthLabelCapital(reportMonth),
    platforms,
    platformLabels,
    metricCols,
    config
  }
}

function aggregateDBRows(rows, groupByField) {
  const agg = {}
  for (const r of rows) {
    const key = r[groupByField] || ''
    if (!agg[key]) agg[key] = { campaign: key, impressions: 0, clicks: 0, spend: 0, reach: 0 }
    agg[key].impressions += Number(r.impressions) || 0
    agg[key].clicks += Number(r.clicks) || 0
    agg[key].spend += Number(r.spend) || 0
    agg[key].reach += Number(r.reach) || 0
  }
  const MIN_IMPRESSIONS = 20
  return Object.values(agg).map(d => ({
    ...d,
    ctr: d.impressions > 0 ? d.clicks / d.impressions * 100 : 0,
    cpm: d.impressions > 0 ? d.spend / d.impressions * 1000 : 0
  })).filter(d => d.impressions >= MIN_IMPRESSIONS).sort((a, b) => b.impressions - a.impressions)
}

// ============== MAIN GENERATE ==============
export async function generateReport(clientId, onNotify, onProgress, fromDB = false) {
  const notify = onNotify || useAppStore.getState().notify

  try {
    if (onProgress) onProgress('Ucitavanje konfiguracije...')
    const config = await fetchReportConfig(clientId)
    if (!config) { notify('Nema konfiguracije izvestaja za ovog klijenta', 'warning'); return }

    // Preload creatives
    preloadCreatives(config.creatives_config, clientId)
    await new Promise(r => setTimeout(r, 1500)) // Wait for images to load

    if (onProgress) onProgress('Ucitavanje podataka...')
    const reportData = fromDB
      ? await collectReportDataFromDB(config)
      : await collectReportData(config)

    if (onProgress) onProgress('AI generise tekst...')
    const aiNarratives = await fetchAINarratives(reportData)
    if (onProgress) onProgress(aiNarratives ? 'Kreiranje PDF-a...' : 'Kreiranje PDF-a (fallback)...')

    const doc = new jsPDF('l', 'mm', 'a4')
    registerFonts(doc)
    const pw = 297, ph = 210, margin = 20
    const cw = pw - 2 * margin
    const cc = config.creatives_config || {}

    // ========= PAGE 1: COVER =========
    pdfDrawBg(doc, pw, ph)

    const coverConfig = cc.cover
    const coverB64 = coverConfig ? getCreativeBase64(`creative_${clientId}_cover`) : null
    const hasImage = coverConfig && coverB64

    if (hasImage) {
      try {
        const imgX = 10
        const imgY = (ph - coverConfig.h) / 2
        doc.addImage(coverB64, getImgFormat(coverB64), imgX, imgY, coverConfig.w, coverConfig.h)
      } catch(e) {}
    }

    const textAreaLeft = hasImage ? 10 + coverConfig.w + 5 : margin
    const textAreaW = pw - margin - textAreaLeft
    const textCenterX = textAreaLeft + textAreaW / 2

    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(26)
    doc.setTextColor(30, 30, 30)
    const titleLines = doc.splitTextToSize(reportData.client.name, textAreaW - 5)
    let ty = ph / 2 - 15
    titleLines.forEach(l => { doc.text(l, textCenterX, ty, { align: 'center' }); ty += 10 })

    doc.setFont('Montserrat', 'italic')
    doc.setFontSize(16)
    doc.text('Digital oglašavanje', textCenterX, ty + 2, { align: 'center' })

    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(18)
    doc.text(`${reportData.monthLabel}.`, textCenterX, ty + 13, { align: 'center' })

    // ========= PAGE 2: EXECUTIVE SUMMARY =========
    doc.addPage()
    pdfDrawBg(doc, pw, ph)
    let y = margin + 5

    const summaryText = aiNarratives ? aiNarratives.executiveSummary : generateExecutiveSummary(reportData)

    summaryText.split('\n').forEach(line => {
      if (line.trim() === '') { y += 3; return }
      if (line.startsWith('- ')) {
        doc.setFont('Montserrat', 'normal')
        doc.setFontSize(11)
        doc.text(line, margin, y)
        y += 5.5
      } else {
        doc.setFont('Montserrat', 'normal')
        doc.setFontSize(11)
        const wrapped = doc.splitTextToSize(line, cw)
        wrapped.forEach(wl => {
          doc.text(wl, margin, y)
          y += 5.5
        })
      }
    })

    // DV360 creative on executive summary page
    const dv360cc = cc.dv360
    if (dv360cc && dv360cc.images?.length > 0) {
      y += 6
      const imgMargin = 10
      const imgAreaW = pw - 2 * imgMargin
      dv360cc.images.forEach((src, i) => {
        const b64 = getCreativeBase64(`creative_${clientId}_dv360_${i}`)
        if (b64 && y + dv360cc.h <= ph - 3) {
          const imgX = imgMargin + (imgAreaW - dv360cc.w) / 2
          doc.addImage(b64, getImgFormat(b64), imgX, y, dv360cc.w, dv360cc.h)
          y += dv360cc.h + 4
        }
      })
    }

    // ========= PAGES 3+: PER-PLATFORM =========
    for (const [platform, data] of Object.entries(reportData.platforms)) {
      doc.addPage()
      pdfDrawBg(doc, pw, ph)
      y = margin

      const platName = reportData.platformLabels[platform] || platform
      const colConfig = reportData.metricCols[platform]
      if (!colConfig) continue

      // Title
      doc.setFont('Montserrat', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(30, 30, 30)
      doc.text(`${platName} ${reportData.monthLabel}.`, margin, y + 6)

      // Date badge
      const [ry, rm] = reportData.reportMonth.split('-').map(Number)
      const lastDay = new Date(ry, rm, 0).getDate()
      const dateStr = `${reportData.reportMonth.replace('-', '/')}/01 - ${reportData.reportMonth.replace('-', '/')}/${String(lastDay).padStart(2, '0')}`
      doc.setFontSize(8)
      doc.setFont('Montserrat', 'normal')
      const dateW = doc.getTextWidth(dateStr) + 10
      doc.setFillColor(240, 200, 0)
      doc.roundedRect(pw - margin - dateW, y - 2, dateW, 12, 3, 3, 'F')
      doc.setTextColor(30, 30, 30)
      doc.text(dateStr, pw - margin - dateW + 5, y + 5)
      y += 18

      // Table 1: Campaigns
      const cols = colConfig.cols
      const headLabels = cols.map(c => c === 'campaign' ? colConfig.label : (REPORT_COL_LABELS[c] || c))

      const tableBody = data.campaigns.map(row => cols.map(c => {
        if (c === 'campaign') return row.campaign || ''
        return fmtTableVal(c, row[c])
      }))
      if (platform !== 'dv360') {
        tableBody.push(cols.map(c => c === 'campaign' ? 'Total' : fmtTableVal(c, data.totals[c])))
      }

      y = pdfRenderTable(doc, headLabels, tableBody, y, margin)

      // Table 2: Insertion Orders (DV360 only)
      if (platform === 'dv360' && data.insertionOrders?.length > 0) {
        const ioConfig = reportData.metricCols.dv360_io
        if (ioConfig) {
          const ioCols = ioConfig.cols
          const ioHeadLabels = ioCols.map(c => c === 'campaign' ? ioConfig.label : (REPORT_COL_LABELS[c] || c))

          const ioTotals = { impressions: 0, clicks: 0, spend: 0 }
          data.insertionOrders.forEach(io => {
            ioTotals.impressions += io.impressions || 0
            ioTotals.clicks += io.clicks || 0
            ioTotals.spend += io.spend || 0
          })
          ioTotals.ctr = ioTotals.impressions > 0 ? ioTotals.clicks / ioTotals.impressions * 100 : 0
          ioTotals.cpm = ioTotals.impressions > 0 ? ioTotals.spend / ioTotals.impressions * 1000 : 0

          const ioBody = data.insertionOrders.map(row => ioCols.map(c => c === 'campaign' ? (row.campaign || '') : fmtTableVal(c, row[c])))
          ioBody.push(ioCols.map(c => c === 'campaign' ? 'Total' : fmtTableVal(c, ioTotals[c])))

          y = pdfRenderTable(doc, ioHeadLabels, ioBody, y, margin)
        }
      }

      y += 8

      // Narrative
      const narrative = aiNarratives && aiNarratives[platform]
        ? aiNarratives[platform]
        : generatePlatformNarrative(platform, data, reportData)
      narrative.split('\n').forEach(line => {
        if (line.trim() === '') { y += 1; return }
        doc.setFont('Montserrat', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(30, 30, 30)
        const wrapped = doc.splitTextToSize(line, cw)
        if (y + wrapped.length * 4.5 > ph - 5) { doc.addPage(); pdfDrawBg(doc, pw, ph); y = margin }
        wrapped.forEach(wl => {
          if (y + 4.5 > ph - 5) { doc.addPage(); pdfDrawBg(doc, pw, ph); y = margin }
          doc.text(wl, margin, y)
          y += 4.5
        })
        y += 1
      })

      // Creatives (skip dv360, shown on summary page)
      if (platform === 'dv360') continue
      const platCC = cc[platform]
      if (platCC && platCC.images?.length > 0) {
        y += 2
        const imgMargin = 10
        const imgAreaW = pw - 2 * imgMargin
        if (y + platCC.h > ph - 3) { doc.addPage(); pdfDrawBg(doc, pw, ph); y = imgMargin }
        const totalImgW = platCC.images.length * platCC.w + (platCC.images.length - 1) * 4
        let imgX = totalImgW <= imgAreaW ? imgMargin + (imgAreaW - totalImgW) / 2 : imgMargin

        platCC.images.forEach((src, i) => {
          const b64 = getCreativeBase64(`creative_${clientId}_${platform}_${i}`)
          if (b64) {
            if (imgX + platCC.w > pw - imgMargin) { imgX = imgMargin; y += platCC.h + 4 }
            if (y + platCC.h > ph - 3) { doc.addPage(); pdfDrawBg(doc, pw, ph); y = imgMargin }
            doc.addImage(b64, getImgFormat(b64), imgX, y, platCC.w, platCC.h)
            imgX += platCC.w + 4
          }
        })
      }
    }

    // ========= LAST PAGE: HVALA =========
    doc.addPage()
    pdfDrawBg(doc, pw, ph)

    const thanksConfig = cc.thanks
    const thanksB64 = thanksConfig ? getCreativeBase64(`creative_${clientId}_thanks`) : null
    const hasThanksImg = thanksConfig && thanksB64
    if (hasThanksImg) {
      try {
        const ix = (pw - thanksConfig.w) / 2
        doc.addImage(thanksB64, getImgFormat(thanksB64), ix, 10, thanksConfig.w, thanksConfig.h)
      } catch(e) {}
    }

    const thanksTextY = hasThanksImg ? 10 + thanksConfig.h + 25 : ph / 2 - 15
    doc.setFont('Montserrat', 'bold')
    doc.setFontSize(36)
    doc.setTextColor(30, 30, 30)
    doc.text('HVALA!', pw / 2, thanksTextY, { align: 'center' })
    doc.setFont('Montserrat', 'normal')
    doc.setFontSize(12)
    doc.setTextColor(100, 100, 100)
    doc.text(reportData.client.name, pw / 2, thanksTextY + 12, { align: 'center' })
    doc.text(`${reportData.monthLabel}.`, pw / 2, thanksTextY + 22, { align: 'center' })

    // Return blob + metadata for approval workflow
    const clientSlug = toAscii(reportData.client.name).replace(/[^a-zA-Z0-9]/g, '_')
    const monthEn = getMonthNameEn(reportData.reportMonth)
    const [fYear] = reportData.reportMonth.split('-')
    const suffix = fromDB ? '_DB' : ''
    const filename = `${clientSlug}-Monthly_Report_${monthEn}_${fYear}${suffix}.pdf`

    return {
      blob: doc.output('blob'),
      filename,
      clientId: reportData.clientId,
      clientName: reportData.client?.name || reportData.clientId,
      reportMonth: reportData.reportMonth,
      reportConfigId: config.id
    }

  } catch (err) {
    console.error('Report generation error:', err)
    notify('Greska pri generisanju izvestaja: ' + err.message, 'warning')
    return null
  }
}

// ============== DB-BASED REPORT GENERATE ==============
export async function generateReportFromDB(clientId, onNotify, onProgress) {
  return generateReport(clientId, onNotify, onProgress, true)
}
