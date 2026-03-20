// ============== DATA ==============
// CLIENTS is loaded dynamically from Supabase in initDashboard()
// This fallback ensures the app doesn't crash before DB loads
let CLIENTS = {};

const NLB_PRODUCTS = {
  'stambeni': { label: 'Stambeni krediti', color: '#4a6cf7' },
  'kes':      { label: 'Keš krediti', color: '#22c55e' },
  'refinansiranje': { label: 'Refinansiranje', color: '#f59e0b' },
  'stednja':  { label: 'Štednja', color: '#ef4444' },
  'agro':     { label: 'Agro krediti', color: '#8b5cf6' }
};

const PLATFORM_NAMES = { google_ads: 'Google Ads', meta: 'Meta', dv360: 'DV360', tiktok: 'TikTok', ga4: 'GA4' };
const PLATFORM_BADGE = { google_ads: 'badge-google', meta: 'badge-meta', dv360: 'badge-dv360', tiktok: 'badge-tiktok', ga4: 'badge-ga4' };

const METRIC_LABELS = {
  impressions: 'Impressions', reach: 'Reach', cpm: 'CPM', ctr: 'CTR',
  clicks: 'Clicks', cpc: 'CPC', conversions: 'Conversions', cpa: 'CPA',
  conv_value: 'Conv. Value', spend: 'Spend', roas: 'ROAS',
  leads: 'Leads', sessions: 'Sessions', users: 'Total Users'
};

// ============== INIT (loads clients from Supabase) ==============
let _initDone = false;
async function initDashboard() {
  if (_initDone) { console.log('[initDashboard] Already initialized, skipping'); return; }
  _initDone = true;
  try {
    CLIENTS = await fetchClients();
    if (Object.keys(CLIENTS).length === 0) {
      const grid = document.getElementById('clientsGrid');
      if (grid) grid.innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-secondary);">Nema klijenata. Proveri konekciju i rolu u bazi.<br><small style="margin-top:8px;display:block;">Otvori F12 Console i pokreni <code>runDiagnostics()</code> za detalje.</small></div>';
      return;
    }
    await Promise.all([prefetchHomepageData(), dbGetSheetLinks()]);
    populateClientSelects();
    renderHomepage();

    // Auto-sync from sheets after dashboard loads
    const links = getSheetLinks();
    if (Object.keys(links).length > 0) {
      setTimeout(() => syncAllSheets(), 1000);
    }
    if (links['nlb_ga4']) {
      setTimeout(() => syncGA4Sheet(), 2000);
    }
  } catch (err) {
    console.error('[initDashboard] error:', err);
    const grid = document.getElementById('clientsGrid');
    if (grid) grid.innerHTML = '<div style="padding:60px;text-align:center;color:var(--red);">Greška pri inicijalizaciji: ' + (err.message || err) + '<br><small style="margin-top:8px;display:block;">Otvori F12 Console i pokreni <code>runDiagnostics()</code> za detalje.</small></div>';
  }
}

function populateClientSelects() {
  const select = document.getElementById('importClient');
  if (!select) return;
  select.innerHTML = '';
  Object.entries(CLIENTS).forEach(([id, client]) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = client.name;
    select.appendChild(opt);
  });
}

// ============== STORAGE (delegates to db.js cache) ==============
function getCampaignData(clientId, platform, month) {
  return dbGetCampaignData(clientId, platform, month);
}
async function saveCampaignData(clientId, platform, month, rows) {
  await dbSaveCampaignData(clientId, platform, month, rows);
}
function getBudget(clientId, platform, month) {
  return dbGetBudget(clientId, platform, month);
}
async function setBudget(clientId, platform, month, amount) {
  await dbSetBudget(clientId, platform, month, amount);
}
function getFlightDays(clientId, month) {
  return dbGetFlightDays(clientId, month);
}
async function setFlightDays(clientId, month, days) {
  await dbSetFlightDays(clientId, month, days);
}

// ============== FORMATTING ==============
function fmt(value, type, currency) {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const cur = currency || 'EUR';
  switch(type) {
    case 'money': return new Intl.NumberFormat('de-DE', { style:'currency', currency: cur, maximumFractionDigits: 0 }).format(value);
    case 'money2': return new Intl.NumberFormat('de-DE', { style:'currency', currency: cur, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    case 'number': return new Intl.NumberFormat('de-DE').format(Math.round(value));
    case 'percent': return (value * 100).toFixed(2) + '%';
    case 'percent_raw': return value.toFixed(2) + '%';
    case 'decimal': return value.toFixed(2);
    default: return String(value);
  }
}

function fmtMetric(key, value, currency) {
  switch(key) {
    case 'impressions': case 'reach': case 'clicks': case 'conversions': return fmt(value, 'number');
    case 'cpm': case 'cpc': case 'cpa': case 'spend': case 'conv_value': return fmt(value, 'money2', currency);
    case 'ctr': return fmt(value, 'percent_raw');
    default: return fmt(value, 'number');
  }
}

// ============== CSV PARSER ==============
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => { row[h.trim()] = vals[idx] ? vals[idx].trim() : ''; });
    rows.push(row);
  }
  return { headers: headers.map(h => h.trim()), rows };
}

function parseCSVLine(line) {
  const result = []; let current = ''; let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    if (inQuotes) {
      if (line[i] === '"' && line[i+1] === '"') { current += '"'; i++; }
      else if (line[i] === '"') { inQuotes = false; }
      else { current += line[i]; }
    } else {
      if (line[i] === '"') { inQuotes = true; }
      else if (line[i] === ',') { result.push(current); current = ''; }
      else { current += line[i]; }
    }
  }
  result.push(current);
  return result;
}

function detectPlatform(headers) {
  const h = headers.map(x => x.toLowerCase());
  if (h.some(x => x.includes('amount spent') || x.includes('ad set name') || (x.includes('campaign name') && h.some(y => y.includes('reach'))))) return 'meta';
  if (h.some(x => x.includes('insertion order') || x.includes('line item') || (x.includes('advertiser') && h.some(y => y.includes('impressions'))))) return 'dv360';
  if (h.some(x => x === 'cost' || x.includes('conv. value') || x.includes('search impr. share') || (x.includes('campaign') && h.some(y => y.includes('impr.'))))) return 'google_ads';
  if (h.some(x => x.includes('tiktok') || (x.includes('campaign name') && h.some(y => y.includes('cost'))))) return 'tiktok';
  return null;
}

function parseNum(v) {
  if (!v || v === '--' || v === 'N/A') return 0;
  const s = String(v).replace(/[€$%,\s]/g, '').replace(',', '.');
  return parseFloat(s) || 0;
}

function mapRow(platform, row) {
  const r = {};
  const get = (...keys) => {
    for (const k of keys) {
      for (const rk of Object.keys(row)) {
        if (rk.toLowerCase().includes(k.toLowerCase())) return row[rk];
      }
    }
    return '';
  };
  r.campaign = get('campaign name', 'campaign', 'Campaign');
  r.insertion_order = get('insertion order', 'Insertion Order') || '';
  r.date = get('reporting starts', 'reporting start', 'day', 'date', 'Date', 'Day') || '';
  r.impressions = parseNum(get('impressions', 'impr.', 'impr'));
  r.clicks = parseNum(get('clicks (all)', 'clicks', 'link clicks'));
  r.spend = parseNum(get('amount spent', 'spend', 'cost', 'total cost'));
  r.reach = parseNum(get('reach'));
  r.conversions = parseNum(get('results', 'conversions', 'total conversions', 'conv.'));
  r.conv_value = parseNum(get('conversion value', 'conv. value', 'total conversion value', 'results value'));

  if (r.impressions > 0) {
    r.ctr = r.clicks / r.impressions * 100;
    r.cpm = r.spend / r.impressions * 1000;
  } else { r.ctr = 0; r.cpm = 0; }
  r.cpc = r.clicks > 0 ? r.spend / r.clicks : 0;
  r.cpa = r.conversions > 0 ? r.spend / r.conversions : 0;

  return r;
}

// ============== NOTIFICATIONS ==============
function notify(msg, type = 'success') {
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.className = 'notification ' + type + ' show';
  setTimeout(() => el.classList.remove('show'), 3000);
}
