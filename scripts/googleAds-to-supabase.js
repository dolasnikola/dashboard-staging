/**
 * =============================================================
 * GOOGLE ADS → SUPABASE (Direct, no Google Sheets)
 * =============================================================
 * Consolidated script for all Google Ads accounts.
 * Fetches daily campaign data via AdsApp.report() and writes
 * directly to Supabase campaign_data table via REST API.
 *
 * REPLACES: googleAds-dashboard-nlb.js, googleAds-dashboard-krka.js,
 *           googleAds-dashboard-urban.js
 *
 * SETUP:
 * 1. Google Ads > Tools > Bulk Actions > Scripts
 * 2. Paste this code
 * 3. Set Script Properties in your Google Ads script (or hardcode below):
 *    - This script reads SUPABASE_URL and SUPABASE_KEY from the CONFIG below
 *    - In production, replace with your actual values
 * 4. Uncomment the relevant ACCOUNT entry for the account you're deploying to
 * 5. Set up daily schedule (e.g., 6-7 AM)
 *
 * NOTE: Deploy this script to each Google Ads account separately.
 *       Only enable the ACCOUNT entry matching that account.
 * =============================================================
 */

var CONFIG = {
  // Supabase credentials — replace with your actual values
  // In Apps Script environment: use PropertiesService if available,
  // in Google Ads Scripts: hardcode here (service_role key, never exposed to frontend)
  SUPABASE_URL: 'https://vorffefuboftlcwteucu.supabase.co',
  SUPABASE_KEY: 'YOUR_SERVICE_ROLE_KEY_HERE', // <-- set this!

  TABLE: 'campaign_data',
  PLATFORM: 'google_ads',
  BATCH_SIZE: 500,

  // Account config — uncomment the ONE that matches this Google Ads account
  // Deploy separately to each account
  ACCOUNTS: [
    {
      client_id: 'nlb',
      campaign_filter: null,        // all enabled campaigns with spend
      lookback_days: 3,             // rewrite last 3 days for conversion lag
    },
    // {
    //   client_id: 'krka',
    //   campaign_filter: 'Krka Terme Search 2025 - 2026',  // only this campaign
    //   lookback_days: 0,
    // },
    // {
    //   client_id: 'urban-garden',
    //   campaign_filter: null,
    //   lookback_days: 3,           // has conversions, needs lookback
    // },
  ],
};

// ============================================================
// MAIN
// ============================================================
function main() {
  for (var i = 0; i < CONFIG.ACCOUNTS.length; i++) {
    var account = CONFIG.ACCOUNTS[i];
    try {
      syncAccount(account);
    } catch (e) {
      Logger.log('❌ ' + account.client_id + ': ' + e.message);
    }
  }
}

function syncAccount(account) {
  var lookbackDays = account.lookback_days || 0;

  // Date range: from (yesterday - lookback) to yesterday
  var yesterday = getDateStr(1);
  var startDate = lookbackDays > 0 ? getDateStr(lookbackDays + 1) : yesterday;
  var dateRange = startDate + ',' + yesterday;

  Logger.log('▶ ' + account.client_id + ': ' + dateRange +
    (lookbackDays > 0 ? ' (lookback ' + lookbackDays + ' days)' : ''));

  // Build GAQL query
  var whereClause = 'WHERE CampaignStatus = ENABLED AND Cost > 0';
  if (account.campaign_filter) {
    whereClause = 'WHERE CampaignName = "' + account.campaign_filter + '"';
  }

  var query =
    'SELECT Date, CampaignName, Cost, Impressions, Clicks, Conversions, CostPerConversion ' +
    'FROM CAMPAIGN_PERFORMANCE_REPORT ' +
    whereClause + ' ' +
    'DURING ' + dateRange;

  var report = AdsApp.report(query);
  var rows = report.rows();
  var rawData = [];

  while (rows.hasNext()) {
    var row = rows.next();
    var impressions = parseInt(row['Impressions'].replace(/,/g, '')) || 0;
    var clicks = parseInt(row['Clicks'].replace(/,/g, '')) || 0;
    var spend = parseFloat(row['Cost'].replace(/,/g, '')) || 0;
    var conversions = parseFloat(row['Conversions'].replace(/,/g, '')) || 0;
    var date = row['Date']; // YYYY-MM-DD format from Google Ads

    rawData.push({
      date: date,
      campaign: row['CampaignName'],
      insertion_order: '',
      impressions: impressions,
      clicks: clicks,
      spend: spend,
      reach: 0,
      conversions: conversions,
      conv_value: 0,
      ctr: impressions > 0 ? Math.round((clicks / impressions) * 100 * 100) / 100 : 0,
      cpm: impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : 0,
      cpc: clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0,
      cpa: conversions > 0 ? Math.round((spend / conversions) * 100) / 100 : 0,
    });
  }

  if (rawData.length === 0) {
    Logger.log('ℹ️ ' + account.client_id + ': nema podataka za period');
    return;
  }

  // Deduplicate by date+campaign (Google Ads can return duplicate rows)
  var deduped = deduplicateRows(rawData);
  Logger.log(account.client_id + ': ' + deduped.length + ' rows after dedup');

  // Determine date range for DELETE (from actual data, not query range)
  var allDates = deduped.map(function(r) { return r.date; }).sort();
  var dateFrom = allDates[0];
  var dateTo = allDates[allDates.length - 1];

  // Add client_id and platform to each row
  for (var j = 0; j < deduped.length; j++) {
    deduped[j].client_id = account.client_id;
    deduped[j].platform = CONFIG.PLATFORM;
    deduped[j].month = deduped[j].date.substring(0, 7); // YYYY-MM
  }

  // DELETE old data for this date range
  deleteByDateRange(account.client_id, CONFIG.PLATFORM, dateFrom, dateTo);

  // INSERT fresh data in batches
  var inserted = insertToSupabase(deduped);
  Logger.log('✅ ' + account.client_id + ': ' + inserted + ' rows synced (' + dateFrom + ' to ' + dateTo + ')');
}

// ============================================================
// DEDUPLICATION
// ============================================================
function deduplicateRows(rows) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = r.date + '|' + r.campaign + '|' + r.insertion_order;
    if (!map[key]) {
      map[key] = {
        date: r.date,
        campaign: r.campaign,
        insertion_order: r.insertion_order,
        impressions: 0, clicks: 0, spend: 0, reach: 0,
        conversions: 0, conv_value: 0,
      };
    }
    map[key].impressions += r.impressions;
    map[key].clicks += r.clicks;
    map[key].spend += r.spend;
    map[key].reach += r.reach;
    map[key].conversions += r.conversions;
    map[key].conv_value += r.conv_value;
  }

  var result = [];
  var keys = Object.keys(map);
  for (var j = 0; j < keys.length; j++) {
    var d = map[keys[j]];
    d.ctr = d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 100 * 100) / 100 : 0;
    d.cpm = d.impressions > 0 ? Math.round((d.spend / d.impressions) * 1000 * 100) / 100 : 0;
    d.cpc = d.clicks > 0 ? Math.round((d.spend / d.clicks) * 100) / 100 : 0;
    d.cpa = d.conversions > 0 ? Math.round((d.spend / d.conversions) * 100) / 100 : 0;
    result.push(d);
  }
  return result;
}

// ============================================================
// SUPABASE REST API
// ============================================================

/**
 * DELETE rows for a client/platform within a date range.
 * Uses Supabase REST API query params for filtering.
 */
function deleteByDateRange(clientId, platform, dateFrom, dateTo) {
  var url = CONFIG.SUPABASE_URL + '/rest/v1/' + CONFIG.TABLE +
    '?client_id=eq.' + encodeURIComponent(clientId) +
    '&platform=eq.' + encodeURIComponent(platform) +
    '&date=gte.' + encodeURIComponent(dateFrom) +
    '&date=lte.' + encodeURIComponent(dateTo);

  var response = UrlFetchApp.fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
    },
    muteHttpExceptions: true,
  });

  var code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log('Deleted ' + clientId + '/' + platform + ' data for ' + dateFrom + ' to ' + dateTo);
  } else {
    Logger.log('WARNING: DELETE failed (' + code + '): ' + response.getContentText());
  }
}

/**
 * INSERT rows into Supabase in batches of BATCH_SIZE.
 */
function insertToSupabase(rows) {
  var totalInserted = 0;

  for (var i = 0; i < rows.length; i += CONFIG.BATCH_SIZE) {
    var batch = rows.slice(i, i + CONFIG.BATCH_SIZE);

    var response = UrlFetchApp.fetch(CONFIG.SUPABASE_URL + '/rest/v1/' + CONFIG.TABLE, {
      method: 'POST',
      headers: {
        'apikey': CONFIG.SUPABASE_KEY,
        'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true,
    });

    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      totalInserted += batch.length;
    } else {
      Logger.log('ERROR: INSERT failed (' + code + '): ' + response.getContentText());
      throw new Error('Supabase insert failed at row ' + i + ': HTTP ' + code);
    }
  }

  return totalInserted;
}

// ============================================================
// HELPERS
// ============================================================

/**
 * Return date as YYYYMMDD string, N days before today.
 */
function getDateStr(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return yyyy + mm + dd;
}

