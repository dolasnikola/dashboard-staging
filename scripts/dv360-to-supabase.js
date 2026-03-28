/**
 * =============================================================
 * DV360 EMAIL REPORT → SUPABASE (Direct, no Google Sheets)
 * =============================================================
 * Reads DV360 scheduled report emails from Gmail,
 * parses CSV attachment, writes data directly to Supabase
 * campaign_data table via REST API, and deletes the email.
 *
 * REPLACES: dv360-dashboard-daily.js
 *
 * SETUP:
 * 1. Open Google Sheet → Extensions → Apps Script (or standalone)
 * 2. Paste this code
 * 3. Set Script Properties:
 *    SUPABASE_URL = https://vorffefuboftlcwteucu.supabase.co
 *    SUPABASE_KEY = <your service_role key>
 * 4. Run processDV360Emails() once manually (approve permissions)
 * 5. Triggers → Add trigger → processDV360Emails → Time-driven → Day timer → 6am-7am
 * =============================================================
 */

// ============== CONFIG ==============
var CONFIG = {
  // Supabase
  SUPABASE_URL: PropertiesService.getScriptProperties().getProperty('SUPABASE_URL'),
  SUPABASE_KEY: PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY'),
  TABLE: 'campaign_data',
  PLATFORM: 'dv360',
  BATCH_SIZE: 500,

  // Advertiser → client_id mapping
  CLIENT_MAP: {
    'NLB banka': 'nlb',
    'Krka_RS_DV360': 'krka',
  },

  // Gmail search query for DV360 emails
  GMAIL_QUERY: 'from:noreply-dv360@google.com subject:"DV360 Dashboard" has:attachment',

  // Krka filter — skip Pharm/Farma/Septolete rows
  KRKA_FILTER: {
    advertiser: 'Krka_RS_DV360',
    include: ['krka terme'],
    exclude: ['farma', 'pharm', 'septolete'],
  },
};

// ============== MAIN ==============
function processDV360Emails() {
  validateConfig_();

  var threads = GmailApp.search(CONFIG.GMAIL_QUERY, 0, 10);

  if (threads.length === 0) {
    Logger.log('Nema novih DV360 mejlova.');
    return;
  }

  var totalProcessed = 0;

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();

    for (var m = 0; m < messages.length; m++) {
      var attachments = messages[m].getAttachments();

      for (var a = 0; a < attachments.length; a++) {
        if (!attachments[a].getName().endsWith('.csv')) continue;

        var csvText = attachments[a].getDataAsString();
        var rows = parseCSV_(csvText);

        if (rows.length === 0) continue;

        // Group by advertiser
        var grouped = groupByAdvertiser_(rows);

        for (var advertiser in grouped) {
          var clientId = CONFIG.CLIENT_MAP[advertiser];
          if (!clientId) {
            Logger.log('Nepoznat advertiser: ' + advertiser + ' — preskačem');
            continue;
          }

          var advRows = grouped[advertiser];

          // Apply Krka filter
          if (advertiser === CONFIG.KRKA_FILTER.advertiser) {
            advRows = filterKrkaRows_(advRows);
            Logger.log('Krka filter: ' + grouped[advertiser].length + ' → ' + advRows.length + ' redova');
          }

          if (advRows.length === 0) continue;

          // Map to campaign_data format
          var mappedRows = mapToCampaignData_(advRows, clientId);
          var deduped = deduplicateRows_(mappedRows);

          // Determine date range from data
          var allDates = deduped.map(function(r) { return r.date; }).sort();
          var dateFrom = allDates[0];
          var dateTo = allDates[allDates.length - 1];

          // DELETE + INSERT
          deleteByDateRange_(clientId, CONFIG.PLATFORM, dateFrom, dateTo);
          var inserted = insertToSupabase_(deduped);
          totalProcessed += inserted;

          Logger.log('✅ ' + clientId + ': ' + inserted + ' rows synced (' + dateFrom + ' to ' + dateTo + ')');
        }
      }
    }

    // Delete email after processing
    threads[t].moveToTrash();
    Logger.log('Mejl obrisan: ' + threads[t].getFirstMessageSubject());
  }

  Logger.log('Završeno. Ukupno: ' + totalProcessed + ' redova');
}

// ============== CSV PARSER ==============
function parseCSV_(text) {
  var lines = text.split('\n');
  if (lines.length < 2) return [];

  var headers = parseCSVLine_(lines[0]);
  var rows = [];

  for (var i = 1; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;

    // Stop at DV360 metadata section
    if (line.indexOf('Report Time') === 0 || line.indexOf('Date Range') === 0 ||
        line.indexOf('Group By') === 0 || line.indexOf('MRC') === 0 ||
        line.indexOf('Filter') === 0) {
      break;
    }

    var values = parseCSVLine_(line);
    if (values.length < headers.length) continue;

    var obj = {};
    for (var h = 0; h < headers.length; h++) {
      obj[headers[h]] = values[h];
    }

    // Must have a valid date
    if (!obj['Date'] || !obj['Date'].match(/^\d{4}/)) continue;

    rows.push(obj);
  }

  return rows;
}

function parseCSVLine_(line) {
  var result = [];
  var current = '';
  var inQuotes = false;

  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

// ============== GROUPING & FILTERING ==============
function groupByAdvertiser_(rows) {
  var grouped = {};
  for (var i = 0; i < rows.length; i++) {
    var adv = rows[i]['Advertiser'] || 'unknown';
    if (!grouped[adv]) grouped[adv] = [];
    grouped[adv].push(rows[i]);
  }
  return grouped;
}

function filterKrkaRows_(rows) {
  return rows.filter(function(row) {
    var campaign = (row['Campaign'] || '').toLowerCase();
    var io = (row['Insertion Order'] || '').toLowerCase();
    var combined = campaign + ' ' + io;

    var hasInclude = CONFIG.KRKA_FILTER.include.some(function(term) {
      return combined.indexOf(term) >= 0;
    });
    var hasExclude = CONFIG.KRKA_FILTER.exclude.some(function(term) {
      return combined.indexOf(term) >= 0;
    });

    return hasInclude && !hasExclude;
  });
}

// ============== ROW MAPPING ==============
function mapToCampaignData_(rows, clientId) {
  return rows.map(function(row) {
    var date = (row['Date'] || '').replace(/\//g, '-'); // 2026/03/14 → 2026-03-14
    var campaign = row['Campaign'] || '';
    var insertionOrder = row['Insertion Order'] || '';
    var impressions = parseNum_(row['Impressions']);
    var reach = parseNum_(row['Unique Reach: Total Reach']);
    var clicks = parseNum_(row['Clicks']);
    var spend = parseFloat(row['Media Cost (Advertiser Currency)'] || 0) || 0;
    spend = Math.round(spend * 100) / 100;

    var ctr = impressions > 0 ? Math.round((clicks / impressions) * 100 * 100) / 100 : 0;
    var cpm = impressions > 0 ? Math.round((spend / impressions) * 1000 * 100) / 100 : 0;
    var cpc = clicks > 0 ? Math.round((spend / clicks) * 100) / 100 : 0;

    return {
      client_id: clientId,
      platform: CONFIG.PLATFORM,
      month: date.substring(0, 7), // YYYY-MM
      date: date,
      campaign: campaign,
      insertion_order: insertionOrder,
      impressions: impressions,
      clicks: clicks,
      spend: spend,
      reach: reach,
      conversions: 0,
      conv_value: 0,
      ctr: ctr,
      cpm: cpm,
      cpc: cpc,
      cpa: 0,
    };
  });
}

function parseNum_(val) {
  if (!val) return 0;
  return parseInt(val.toString().replace(/,/g, ''), 10) || 0;
}

// ============== DEDUPLICATION ==============
function deduplicateRows_(rows) {
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var key = r.date + '|' + r.campaign + '|' + r.insertion_order;
    if (!map[key]) {
      map[key] = {
        client_id: r.client_id, platform: r.platform, month: r.month,
        date: r.date, campaign: r.campaign, insertion_order: r.insertion_order,
        impressions: 0, clicks: 0, spend: 0, reach: 0,
        conversions: 0, conv_value: 0,
      };
    }
    map[key].impressions += r.impressions;
    map[key].clicks += r.clicks;
    map[key].spend += r.spend;
    map[key].reach += r.reach;
  }

  var result = [];
  var keys = Object.keys(map);
  for (var j = 0; j < keys.length; j++) {
    var d = map[keys[j]];
    d.ctr = d.impressions > 0 ? Math.round((d.clicks / d.impressions) * 100 * 100) / 100 : 0;
    d.cpm = d.impressions > 0 ? Math.round((d.spend / d.impressions) * 1000 * 100) / 100 : 0;
    d.cpc = d.clicks > 0 ? Math.round((d.spend / d.clicks) * 100) / 100 : 0;
    d.cpa = 0;
    result.push(d);
  }
  return result;
}

// ============== SUPABASE REST API ==============
function deleteByDateRange_(clientId, platform, dateFrom, dateTo) {
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
    Logger.log('Deleted ' + clientId + '/' + platform + ' for ' + dateFrom + ' to ' + dateTo);
  } else {
    Logger.log('WARNING: DELETE failed (' + code + '): ' + response.getContentText());
  }
}

function insertToSupabase_(rows) {
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

function validateConfig_() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
    throw new Error(
      'Supabase credentials missing! Set Script Properties:\n' +
      '  SUPABASE_URL = https://vorffefuboftlcwteucu.supabase.co\n' +
      '  SUPABASE_KEY = <your service_role key>'
    );
  }
}

// ============== MANUAL HELPERS ==============
function testRun() {
  processDV360Emails();
}

function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'processDV360Emails') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('processDV360Emails')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log('Daily trigger kreiran (6-7 AM)');
}
