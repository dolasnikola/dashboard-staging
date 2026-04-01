// ============== ASCII TRANSLITERATION ==============
const ASCII_MAP = {
  'š':'s','č':'c','ć':'c','ž':'z','đ':'dj',
  'Š':'S','Č':'C','Ć':'C','Ž':'Z','Đ':'Dj',
  'ö':'o','ü':'u','ä':'a','ë':'e','ï':'i',
  'Ö':'O','Ü':'U','Ä':'A','Ë':'E','Ï':'I',
  'è':'e','é':'e','ê':'e','à':'a','á':'a','â':'a',
  'ò':'o','ó':'o','ô':'o','ù':'u','ú':'u','û':'u',
  'ì':'i','í':'i','î':'i','ñ':'n','ý':'y',
  // Unicode symbols AI often generates
  '€':'EUR', '£':'GBP', '¥':'JPY',
  '—':'-', '–':'-', '…':'...',
  '\u2018':"'", '\u2019':"'", '\u201C':'"', '\u201D':'"',
  '\u00A0':' ', '\u2009':' ', '\u202F':' ',
  '•':'-', '·':'-', '\u2022':'-',
  '×':'x', '÷':'/', '±':'+/-',
  '²':'2', '³':'3', '¹':'1',
  '½':'1/2', '¼':'1/4', '¾':'3/4'
}

export function toAscii(str) {
  if (!str) return ''
  return str.replace(/[^\x00-\x7F]/g, c => ASCII_MAP[c] || '')
}

// ============== FORMAT HELPERS ==============
export function fmtNum(val) {
  if (!val || val === 0) return '0'
  return Math.round(val).toLocaleString('de-DE')
}

export function fmtEur(val) {
  if (!val) return '0,00 €'
  return val.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function fmtTableVal(col, val) {
  if (col === 'campaign') return toAscii(val || '')
  if (col === 'impressions' || col === 'clicks' || col === 'reach') return fmtNum(val)
  if (col === 'ctr') return (val || 0).toFixed(2) + '%'
  if (col === 'cpm') return fmtEur(val)
  if (col === 'spend') return fmtEur(val)
  return val
}

export function cleanNum(val) {
  if (!val) return 0
  const cleaned = val.toString().replace(/[€%\s\u00a0]/g, '').replace(/,/g, '')
  return parseFloat(cleaned) || 0
}

// ============== DATE HELPERS ==============
export function getReportMonth() {
  const now = new Date()
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
}

const MONTHS_SR = ['januar', 'februar', 'mart', 'april', 'maj', 'jun', 'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar']
const MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December']

export function getMonthLabel(monthStr) {
  const [y, m] = monthStr.split('-')
  return `${MONTHS_SR[parseInt(m) - 1]} ${y}`
}

export function getMonthLabelCapital(monthStr) {
  const l = getMonthLabel(monthStr)
  return l.charAt(0).toUpperCase() + l.slice(1)
}

export function getMonthNameEn(monthStr) {
  const m = parseInt(monthStr.split('-')[1])
  return MONTHS_EN[m - 1]
}

// ============== CSV PARSING ==============
const ALLOWED_CSV_DOMAINS = ['docs.google.com', 'sheets.googleapis.com']

export async function fetchCSV(url) {
  try {
    const hostname = new URL(url).hostname
    if (!ALLOWED_CSV_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) {
      throw new Error('Blocked fetch: URL domain not allowed')
    }
  } catch (e) { if (e.message.includes('Blocked')) throw e; throw new Error('Invalid URL') }
  const response = await fetch(url)
  const text = await response.text()
  return parseCSVText(text)
}

export function parseCSVText(text) {
  const lines = text.split(/\r?\n/)
  return lines.map(line => {
    const result = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') { inQuotes = !inQuotes }
      else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = '' }
      else { current += line[i] }
    }
    result.push(current.trim())
    return result
  }).filter(row => row.length > 1 || (row[0] && row[0].trim() !== ''))
}

// ============== PLATFORM PARSERS ==============
export function parseSearchData(rows) {
  if (!rows || rows.length < 2) return []
  const data = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0] || row[0] === 'Total' || row[0].startsWith('Period')) continue
    const impressions = cleanNum(row[1])
    const clicks = cleanNum(row[2])
    data.push({
      campaign: row[0], impressions, clicks,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      spend: cleanNum(row[4])
    })
  }
  return data
}

export function parseMetaData(rows) {
  if (!rows || rows.length < 2) return []
  const data = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row[0] || row[0] === 'Total' || row[0].startsWith('Period')) continue
    const impressions = cleanNum(row[2])
    const clicks = cleanNum(row[3])
    data.push({
      campaign: row[0], reach: cleanNum(row[1]), impressions, clicks,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      spend: cleanNum(row[5])
    })
  }
  return data
}

export function parseGDNData(rows, campaignFilter) {
  if (!rows || rows.length < 2) return { campaigns: [], insertionOrders: [] }
  const header = rows[0]
  if (header[0] && header[0].trim() === 'Advertiser') {
    return parseGDNRaw(rows, campaignFilter)
  }
  return parseGDNScript(rows)
}

function parseGDNRaw(rows, campaignFilter) {
  const header = rows[0].map(h => h.toLowerCase().trim())
  const colIdx = (name) => header.findIndex(h => h.includes(name))

  const iCampaign = colIdx('campaign') !== -1 ? colIdx('campaign') : 1
  const iIO = colIdx('insertion order') !== -1 ? colIdx('insertion order') : 2
  const iImpressions = colIdx('impressions') !== -1 ? colIdx('impressions') : 4
  const iReach = colIdx('total reach') !== -1 ? colIdx('total reach') : 5
  const iClicks = colIdx('clicks') !== -1 ? colIdx('clicks') : 6
  // Prefer Revenue (includes agency markup) > Total Media Cost > Media Cost
  const iCost = colIdx('revenue') !== -1 ? colIdx('revenue') : (colIdx('total media cost') !== -1 ? colIdx('total media cost') : (colIdx('media cost') !== -1 ? colIdx('media cost') : 8))

  const campaignAgg = {}
  const ioAgg = {}

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const campaignName = (row[iCampaign] || '').trim()
    if (campaignFilter && campaignName.indexOf(campaignFilter) === -1) continue

    const impressions = cleanNum(row[iImpressions])
    const reach = cleanNum(row[iReach])
    const clicks = cleanNum(row[iClicks])
    let cost = cleanNum(row[iCost])
    if (cost > 100000) cost = cost / 1000000

    const ioName = (row[iIO] || '').trim()

    if (!campaignAgg[campaignName]) campaignAgg[campaignName] = { impressions: 0, reach: 0, clicks: 0, spend: 0 }
    campaignAgg[campaignName].impressions += impressions
    campaignAgg[campaignName].reach += reach
    campaignAgg[campaignName].clicks += clicks
    campaignAgg[campaignName].spend += cost

    if (ioName) {
      if (!ioAgg[ioName]) ioAgg[ioName] = { impressions: 0, reach: 0, clicks: 0, spend: 0 }
      ioAgg[ioName].impressions += impressions
      ioAgg[ioName].reach += reach
      ioAgg[ioName].clicks += clicks
      ioAgg[ioName].spend += cost
    }
  }

  const MIN_IMPRESSIONS = 20
  const toArray = (obj) => Object.entries(obj).map(([name, d]) => ({
    campaign: name, ...d,
    ctr: d.impressions > 0 ? d.clicks / d.impressions * 100 : 0,
    cpm: d.impressions > 0 ? d.spend / d.impressions * 1000 : 0
  })).filter(d => d.impressions >= MIN_IMPRESSIONS).sort((a, b) => b.impressions - a.impressions)

  return { campaigns: toArray(campaignAgg), insertionOrders: toArray(ioAgg) }
}

function parseGDNScript(rows) {
  const table1 = []
  const table2 = []
  let currentTable = 1
  let foundFirstHeader = false

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const isEmpty = row.every(cell => !cell || cell.trim() === '')
    if (isEmpty) { if (foundFirstHeader) currentTable = 2; continue }
    if (row[0] === 'Campaign' || row[0] === 'Insertion Order') { foundFirstHeader = true; continue }
    if (row[0] === 'Total') continue

    const impressions = cleanNum(row[1])
    const clicks = cleanNum(row[2])
    const spend = cleanNum(row[5])
    const item = {
      campaign: row[0], impressions, clicks,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      cpm: impressions > 0 ? spend / impressions * 1000 : 0,
      spend
    }
    if (currentTable === 1) table1.push(item)
    else table2.push(item)
  }

  return { campaigns: table1, insertionOrders: table2 }
}

// ============== LOCAL DISPLAY PARSER ==============
export function parseLocalDisplayData(rows) {
  if (!rows || rows.length < 2) return []
  const header = rows[0].map(h => h.toLowerCase().trim())
  const colIdx = (name) => header.findIndex(h => h.includes(name))

  const iPublisher = colIdx('publisher')
  const iFormat = colIdx('format')
  const iType = colIdx('type')
  const iImpressions = colIdx('impressions')
  const iClicks = colIdx('clicks')

  if (iPublisher === -1 || iImpressions === -1 || iClicks === -1) return []

  const data = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const publisher = (row[iPublisher] || '').trim()
    if (!publisher || publisher.toLowerCase() === 'total') continue

    let label = publisher
    if (iFormat !== -1 && row[iFormat]?.trim()) label += ' / ' + row[iFormat].trim()
    if (iType !== -1 && row[iType]?.trim()) label += ' / ' + row[iType].trim()

    const impressions = cleanNum(row[iImpressions])
    const clicks = cleanNum(row[iClicks])
    data.push({
      campaign: label,
      impressions,
      clicks,
      ctr: impressions > 0 ? clicks / impressions * 100 : 0,
      spend: 0
    })
  }
  return data
}

// ============== TOTALS HELPER ==============
export function sumTotals(items) {
  const t = { impressions: 0, clicks: 0, spend: 0, reach: 0 }
  items.forEach(c => {
    t.impressions += c.impressions || 0
    t.clicks += c.clicks || 0
    t.spend += c.spend || 0
    t.reach += c.reach || 0
  })
  t.ctr = t.impressions > 0 ? t.clicks / t.impressions * 100 : 0
  t.cpm = t.impressions > 0 ? t.spend / t.impressions * 1000 : 0
  return t
}

// ============== PDF DRAWING HELPERS ==============
export function pdfDrawBg(doc, pw, ph) {
  doc.setFillColor(232, 228, 222)
  doc.rect(0, 0, pw, ph, 'F')
}

const TABLE_COL_WIDTHS = {
  4: { 0: { cellWidth: 120 }, 1: { cellWidth: 50 }, 2: { cellWidth: 40 }, 3: { cellWidth: 35 } },
  5: { 0: { cellWidth: 105 }, 1: { cellWidth: 38 }, 2: { cellWidth: 32 }, 3: { cellWidth: 28 }, 4: { cellWidth: 38 } },
  6: { 0: { cellWidth: 85 }, 1: { cellWidth: 35 }, 2: { cellWidth: 35 }, 3: { cellWidth: 30 }, 4: { cellWidth: 28 }, 5: { cellWidth: 35 } }
}

export function pdfRenderTable(doc, headLabels, tableBody, y, margin) {
  const colCount = headLabels.length
  const colStyles = TABLE_COL_WIDTHS[colCount] || {}

  doc.autoTable({
    startY: y,
    head: [headLabels],
    body: tableBody,
    margin: { left: margin, right: margin },
    columnStyles: colStyles,
    styles: { fontSize: 9, cellPadding: 3, font: 'times', textColor: [30, 30, 30], lineColor: [200, 195, 185], lineWidth: 0.3 },
    headStyles: { fillColor: [240, 200, 0], textColor: [30, 30, 30], fontStyle: 'bold', lineWidth: 0 },
    bodyStyles: { fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [248, 245, 240] },
    didParseCell: function(d) { if (d.row.index === tableBody.length - 1 && d.section === 'body') d.cell.styles.fontStyle = 'bold' },
    theme: 'grid'
  })
  return doc.lastAutoTable.finalY
}

// ============== CREATIVE IMAGE HELPERS ==============
const _creativeImgCache = {}

export function preloadCreatives(creativesConfig, clientId) {
  if (!creativesConfig) return
  Object.entries(creativesConfig).forEach(([key, config]) => {
    if (key === 'cover' || key === 'thanks') {
      if (!config.image) return
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.src = config.image
      const cacheKey = `creative_${clientId}_${key}`
      img.onload = () => { _creativeImgCache[cacheKey] = img }
    } else if (config.images) {
      config.images.forEach((src, i) => {
        const img = new Image()
        img.crossOrigin = 'anonymous'
        img.src = src
        const cacheKey = `creative_${clientId}_${key}_${i}`
        img.onload = () => { _creativeImgCache[cacheKey] = img }
      })
    }
  })
}

export function getCreativeBase64(cacheKey) {
  const img = _creativeImgCache[cacheKey]
  if (!img) return null
  try {
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    canvas.getContext('2d').drawImage(img, 0, 0)
    const isPng = img.src && img.src.toLowerCase().endsWith('.png')
    return canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.85)
  } catch(e) { return null }
}

export function getImgFormat(b64) {
  return b64 && b64.indexOf('image/png') > -1 ? 'PNG' : 'JPEG'
}

// ============== REPORT COL LABELS ==============
export const REPORT_COL_LABELS = {
  campaign: 'Campaign', impressions: 'Impressions', clicks: 'Clicks',
  ctr: 'CTR', spend: 'Budget', reach: 'Reach', cpm: 'CPM'
}
