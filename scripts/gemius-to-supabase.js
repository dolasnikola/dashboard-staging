/**
 * Gemius DirectEffect → Supabase importer
 *
 * Reads Gemius emails, detects client + campaign + month from subject,
 * parses XLSX/CSV attachment, and writes directly to Supabase
 * local_display_report table via REST API.
 *
 * Each month: DELETE old rows for client+month, INSERT fresh rows.
 * No Google Sheets in the pipeline.
 *
 * Email subject format: "Report: Kampanja Mesec Godina"
 * Example: "Report: NLB Stednja Mart 2026"
 *   → client_id: 'nlb', campaign: 'NLB Stednja Mart 2026', month: '2026-03'
 *
 * SETUP:
 * 1. Open any Google Sheet → Extensions → Apps Script
 * 2. Paste this entire file
 * 3. Enable Drive API: Services → + → Drive API → Add
 * 4. Add Script Properties (Project Settings → Script Properties):
 *    - SUPABASE_URL     = https://vorffefuboftlcwteucu.supabase.co
 *    - SUPABASE_KEY     = <service_role key>
 * 5. First run: authorize Gmail + Drive access
 * 6. Run `listGemiusEmails` to verify emails are found
 * 7. Run `inspectHeaders` to check column names
 * 8. Run `testImport` to test (processes emails but logs only, no delete)
 * 9. Run `importGemiusReport` for real import
 * 10. Set up trigger: Edit → Triggers → Add trigger
 *     - Function: importGemiusReport
 *     - Event source: Time-driven
 *     - Type: Month timer
 *     - Day of month: 2
 *     - Time: 08:00–09:00
 */

// ============ CONFIGURATION ============

const CONFIG = {
  // Gmail search
  SENDER: 'no-reply@gde.gemius.com',
  SEARCH_QUERY: 'from:no-reply@gde.gemius.com has:attachment',
  SEARCH_DAYS_BACK: 10,

  // Supabase (read from Script Properties — NEVER hardcode keys)
  SUPABASE_URL: PropertiesService.getScriptProperties().getProperty('SUPABASE_URL'),
  SUPABASE_KEY: PropertiesService.getScriptProperties().getProperty('SUPABASE_KEY'),
  TABLE: 'local_display_report',

  // Batch size for Supabase REST API inserts
  BATCH_SIZE: 500,

  // Column mapping: field → Gemius report column header aliases
  // Gemius "Placement Ranking" has: Campaign | Placement | Imp | Clicks | CTR | Actions
  // Publisher, format, type are parsed from the Placement column (e.g. "LD/Blic / 320x100 / Product")
  COLUMN_MAP: {
    placement:   ['Placement', 'Placement name', 'Kreacja'],
    impressions: ['Imp', 'Impressions', 'Impr.', 'Impr', 'Views', 'Odsłony'],
    clicks:      ['Clicks', 'Click', 'Kliknięcia'],
    actions:     ['Actions', 'Action', 'Akcje'],
    ctr:         ['CTR']
  }
};

/**
 * CLIENT MAP — keywords from email subject → client_id
 * First match wins. Most specific keyword first.
 */
const CLIENT_MAP = [
  { keywords: ['NLB', 'Komercijalna'],      client_id: 'nlb'          },
  { keywords: ['Urban Garden', 'Urban'],     client_id: 'urban-garden' },
  { keywords: ['Krka', 'Terme'],             client_id: 'krka'         },
  // { keywords: ['Novi Klijent'],            client_id: 'novi-klijent' },
];

// ============ MAIN FUNCTION ============

function importGemiusReport() {
  validateConfig_();

  var emails = findAllGemiusEmails_();
  if (emails.length === 0) {
    Logger.log('No Gemius emails found in the last ' + CONFIG.SEARCH_DAYS_BACK + ' days.');
    sendNotification_('Gemius Import', 'No Gemius emails found. Check sender address or search window.');
    return;
  }

  Logger.log('Found ' + emails.length + ' Gemius email(s).');

  var totalRows = 0;
  var processed = [];
  var failed = [];

  // Track which client+month combos we've already cleared
  var cleared = {};

  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    var subject = email.getSubject();
    Logger.log('--- Processing: ' + subject + ' ---');

    // Detect client
    var clientId = detectClient_(subject);
    if (!clientId) {
      Logger.log('WARNING: Could not detect client from subject: "' + subject + '"');
      failed.push(subject + ' (unknown client)');
      continue;
    }
    Logger.log('Detected client: ' + clientId);

    // Detect month
    var month = detectMonth_(subject);
    Logger.log('Detected month: ' + month);

    // Extract campaign name (full subject after "Report: ")
    var campaign = extractCampaign_(subject);
    Logger.log('Campaign: ' + campaign);

    // Get attachment
    var attachment = findReportAttachment_(email);
    if (!attachment) {
      Logger.log('WARNING: No XLSX/CSV attachment in: ' + subject);
      failed.push(subject + ' (no attachment)');
      continue;
    }

    // Parse attachment
    var rawData = parseAttachment_(attachment);
    if (!rawData || rawData.length < 2) {
      Logger.log('WARNING: Could not parse attachment for: ' + subject);
      failed.push(subject + ' (parse error)');
      continue;
    }

    // Map columns
    var mappedData = mapColumns_(rawData, clientId, campaign, month);
    if (!mappedData || mappedData.length === 0) {
      Logger.log('WARNING: Column mapping failed for: ' + subject);
      failed.push(subject + ' (mapping error)');
      continue;
    }

    // Delete old data for this client+month (once per combo)
    var clearKey = clientId + '_' + month;
    if (!cleared[clearKey]) {
      deleteMonthData_(clientId, month);
      cleared[clearKey] = true;
    }

    // Insert into Supabase
    var inserted = insertToSupabase_(mappedData);
    totalRows += inserted;
    processed.push(clientId + ' / ' + campaign + ' / ' + month + ' (' + inserted + ' rows)');

    // Trash processed email
    email.moveToTrash();
    Logger.log('Email moved to trash: ' + subject);
  }

  // Summary
  var msg = 'Imported ' + totalRows + ' rows from ' + processed.length + ' email(s).\n';
  msg += 'Details:\n' + processed.join('\n');
  if (failed.length > 0) {
    msg += '\n\nFailed (' + failed.length + '):\n' + failed.join('\n');
  }
  Logger.log(msg);
  sendNotification_('Gemius Import ✓', msg);
}

// ============ CAMPAIGN EXTRACTION ============

/**
 * Extracts full campaign name from subject.
 * "Report: NLB Stednja Mart 2026" → "NLB Stednja Mart 2026"
 * Strips "Report:" prefix and trims.
 */
function extractCampaign_(subject) {
  var cleaned = subject.replace(/^report\s*:\s*/i, '').trim();
  return cleaned || subject;
}

// ============ CLIENT & MONTH DETECTION ============

function detectClient_(subject) {
  var subjectLower = subject.toLowerCase();
  for (var i = 0; i < CLIENT_MAP.length; i++) {
    var entry = CLIENT_MAP[i];
    for (var j = 0; j < entry.keywords.length; j++) {
      if (subjectLower.indexOf(entry.keywords[j].toLowerCase()) >= 0) {
        return entry.client_id;
      }
    }
  }
  return null;
}

var MONTH_NAMES = {
  'januar': '01', 'februar': '02', 'mart': '03', 'april': '04',
  'maj': '05', 'jun': '06', 'jul': '07', 'avgust': '08',
  'septembar': '09', 'oktobar': '10', 'novembar': '11', 'decembar': '12',
  'january': '01', 'february': '02', 'march': '03',
  'may': '05', 'june': '06', 'july': '07', 'august': '08',
  'september': '09', 'october': '10', 'november': '11', 'december': '12'
};

function detectMonth_(subject) {
  var subjectLower = subject.toLowerCase();

  // Try "Mesec Godina" pattern
  var monthNames = Object.keys(MONTH_NAMES);
  for (var i = 0; i < monthNames.length; i++) {
    var name = monthNames[i];
    var regex = new RegExp(name + '\\s*(\\d{4})', 'i');
    var match = subjectLower.match(regex);
    if (match) {
      return match[1] + '-' + MONTH_NAMES[name];
    }
  }

  // Try numeric MM/YYYY or MM-YYYY or MM.YYYY
  var numericMatch = subjectLower.match(/(\d{1,2})[\/\-\.](\d{4})/);
  if (numericMatch) {
    return numericMatch[2] + '-' + numericMatch[1].padStart(2, '0');
  }

  // Fallback: previous month
  var now = new Date();
  now.setMonth(now.getMonth() - 1);
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');
  Logger.log('WARNING: Could not detect month from subject, using fallback: ' + y + '-' + m);
  return y + '-' + m;
}

// ============ SUPABASE FUNCTIONS ============

function validateConfig_() {
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
    throw new Error(
      'Missing Supabase credentials. Go to Project Settings → Script Properties and add:\n' +
      '  SUPABASE_URL = https://vorffefuboftlcwteucu.supabase.co\n' +
      '  SUPABASE_KEY = <your service_role key>'
    );
  }
}

/**
 * DELETE all rows for a client+month before inserting fresh data.
 */
function deleteMonthData_(clientId, month) {
  var url = CONFIG.SUPABASE_URL + '/rest/v1/' + CONFIG.TABLE +
    '?client_id=eq.' + encodeURIComponent(clientId) +
    '&month=eq.' + encodeURIComponent(month);

  var response = UrlFetchApp.fetch(url, {
    method: 'DELETE',
    headers: {
      'apikey': CONFIG.SUPABASE_KEY,
      'Authorization': 'Bearer ' + CONFIG.SUPABASE_KEY
    },
    muteHttpExceptions: true
  });

  var code = response.getResponseCode();
  if (code >= 200 && code < 300) {
    Logger.log('Deleted old data for ' + clientId + ' / ' + month);
  } else {
    Logger.log('WARNING: DELETE failed (' + code + '): ' + response.getContentText());
  }
}

/**
 * INSERT rows into Supabase in batches.
 * Returns total rows inserted.
 */
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
        'Prefer': 'return=minimal'
      },
      payload: JSON.stringify(batch),
      muteHttpExceptions: true
    });

    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      totalInserted += batch.length;
    } else {
      Logger.log('ERROR: INSERT failed (' + code + '): ' + response.getContentText());
      throw new Error('Supabase insert failed for batch starting at row ' + i + ': HTTP ' + code);
    }
  }

  Logger.log('Inserted ' + totalInserted + ' rows into ' + CONFIG.TABLE);
  return totalInserted;
}

// ============ GMAIL FUNCTIONS ============

function findAllGemiusEmails_() {
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.SEARCH_DAYS_BACK);

  var query = CONFIG.SEARCH_QUERY + ' after:' + formatDate_(cutoffDate);
  var threads = GmailApp.search(query, 0, 50);

  var emails = [];
  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      if (messages[m].getFrom().indexOf(CONFIG.SENDER) >= 0) {
        emails.push(messages[m]);
      }
    }
  }

  emails.sort(function(a, b) { return a.getDate() - b.getDate(); });
  return emails;
}

function findReportAttachment_(message) {
  var attachments = message.getAttachments();
  for (var i = 0; i < attachments.length; i++) {
    var name = attachments[i].getName().toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      return attachments[i];
    }
  }
  return null;
}

// ============ PARSING ============

function parseAttachment_(attachment) {
  var name = attachment.getName().toLowerCase();
  if (name.endsWith('.csv')) {
    return parseCSV_(attachment.getDataAsString());
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXLSX_(attachment);
  }
  return null;
}

function parseCSV_(csvText) {
  var lines = csvText.split(/\r?\n/).filter(function(line) { return line.trim(); });
  return lines.map(function(line) { return parseCSVLine_(line); });
}

function parseCSVLine_(line) {
  var result = [];
  var current = '';
  var inQuotes = false;

  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === ',' || ch === ';') && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseXLSX_(attachment) {
  var blob = attachment.copyBlob();
  blob.setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  // Upload XLSX to Drive as Google Sheet (works with Drive API v2 and v3)
  var tempFile;
  try {
    // Try v2 (Drive.Files.insert)
    tempFile = Drive.Files.insert(
      { title: '_gemius_temp_import', mimeType: 'application/vnd.google-apps.spreadsheet' },
      blob,
      { convert: true }
    );
  } catch (e) {
    // Fallback v3 (Drive.Files.create)
    tempFile = Drive.Files.create(
      { name: '_gemius_temp_import', mimeType: 'application/vnd.google-apps.spreadsheet' },
      blob,
      { convert: true }
    );
  }

  try {
    var tempSS = SpreadsheetApp.openById(tempFile.id);
    // Use first sheet (usually "Local Display - Summary")
    var tempSheet = tempSS.getSheets()[0];
    var allData = tempSheet.getDataRange().getValues();

    // Find the header row — must have BOTH "Placement" AND "Imp" in the same row
    // This avoids matching "Placement Ranking" title row
    var headerRowIdx = -1;
    for (var r = 0; r < Math.min(30, allData.length); r++) {
      var rowStr = allData[r].join('|').toLowerCase();
      if (rowStr.indexOf('placement') >= 0 && rowStr.indexOf('imp') >= 0) {
        headerRowIdx = r;
        break;
      }
    }

    if (headerRowIdx < 0) {
      Logger.log('WARNING: Could not find header row with "Placement" or "Imp"');
      Logger.log('First 5 rows:');
      for (var d = 0; d < Math.min(5, allData.length); d++) {
        Logger.log('  Row ' + d + ': ' + allData[d].join(' | '));
      }
      return null;
    }

    Logger.log('Found header row at index ' + headerRowIdx + ': ' + allData[headerRowIdx].join(' | '));

    // Return header row + data rows (skip everything before header)
    var result = allData.slice(headerRowIdx);
    return result.map(function(row) { return row.map(function(cell) { return String(cell); }); });
  } finally {
    DriveApp.getFileById(tempFile.id).setTrashed(true);
  }
}

// ============ COLUMN MAPPING ============

/**
 * Maps raw data rows to Supabase local_display_report format.
 *
 * Gemius Placement column contains everything:
 *   "LD/Blic / 320x100 / Product"
 *   "LD/Mondo / Incorner / Product / tracking"
 *   "LD/Telegraf / 450x210 / Image / tracking"
 *
 * Parsed into: publisher=Blic, format=320x100, type=Product
 */
function mapColumns_(rawData, clientId, campaign, month) {
  var headers = rawData[0];
  var dataRows = rawData.slice(1);

  var indices = {};
  var fields = Object.keys(CONFIG.COLUMN_MAP);
  for (var f = 0; f < fields.length; f++) {
    indices[fields[f]] = findColumnIndex_(headers, CONFIG.COLUMN_MAP[fields[f]]);
  }

  Logger.log('Column mapping:');
  for (var field in indices) {
    var idx = indices[field];
    Logger.log('  ' + field + ' → ' + (idx >= 0 ? 'col ' + idx + ' (' + headers[idx] + ')' : 'NOT FOUND'));
  }

  if (indices.placement < 0 || indices.impressions < 0) {
    Logger.log('ERROR: Missing placement or impressions column.');
    Logger.log('Available headers: ' + headers.join(' | '));
    return null;
  }

  var result = [];
  for (var r = 0; r < dataRows.length; r++) {
    var row = dataRows[r];
    var placement = cleanValue_(row[indices.placement]);
    var impressions = parseNumber_(row[indices.impressions]);

    // Skip empty rows, total/summary rows, and the "-" placeholder
    if (!placement || placement === '-' || placement === '') continue;
    var placementLower = placement.toLowerCase();
    if (placementLower.indexOf('total') >= 0 || placementLower === 'sum') continue;

    // Parse placement: "LD/Publisher / Format / Type [/ tracking]"
    var parsed = parsePlacement_(placement);

    var clicks = indices.clicks >= 0 ? parseNumber_(row[indices.clicks]) : 0;
    var actions = indices.actions >= 0 ? parseNumber_(row[indices.actions]) : 0;

    // Calculate CTR ourselves (more reliable than parsing percentage string)
    var ctr = impressions > 0 ? (clicks / impressions * 100) : 0;
    ctr = Math.round(ctr * 100) / 100;

    result.push({
      client_id:   clientId,
      campaign:    campaign,
      month:       month,
      publisher:   parsed.publisher,
      format:      parsed.format,
      type:        parsed.type,
      impressions: impressions,
      clicks:      clicks,
      ctr:         ctr,
      actions:     actions
    });
  }

  return result;
}

/**
 * Parse Gemius placement string into publisher, format, type.
 *
 * Examples:
 *   "LD/Blic / 320x100 / Product"           → {publisher:"Blic", format:"320x100", type:"Product"}
 *   "LD/Mondo / Incorner / Product / tracking" → {publisher:"Mondo", format:"Incorner", type:"Product"}
 *   "LD/Telegraf / 450x210 / Image / tracking" → {publisher:"Telegraf", format:"450x210", type:"Image"}
 *
 * Pattern: LD/Publisher / Format / Type [/ tracking]
 * Split by " / ", first part split by "/" to get publisher after "LD/"
 */
function parsePlacement_(placement) {
  var result = { publisher: '', format: '', type: '' };

  // Split by " / " (space-slash-space)
  var parts = placement.split(/\s*\/\s*/);

  if (parts.length >= 2) {
    // First part is "LD" prefix, second is publisher
    // But sometimes it's "LD/Blic" as one token if no spaces around /
    // Handle both: "LD" + "Blic" or "LD/Blic"
    if (parts[0].toUpperCase() === 'LD' && parts.length >= 4) {
      // "LD / Blic / 320x100 / Product [/ tracking]"
      result.publisher = parts[1].trim();
      result.format = parts[2].trim();
      result.type = parts[3].trim();
    } else if (parts[0].toUpperCase().indexOf('LD') === 0) {
      // "LD/Blic / 320x100 / Product" — LD and publisher stuck together
      var firstPart = parts[0];
      var slashIdx = firstPart.indexOf('/');
      if (slashIdx >= 0) {
        result.publisher = firstPart.substring(slashIdx + 1).trim();
      } else {
        result.publisher = firstPart.replace(/^LD\s*/i, '').trim();
      }
      if (parts.length >= 3) result.format = parts[1].trim();
      if (parts.length >= 4) result.type = parts[2].trim();
      // If only 3 parts: publisher / format / type
      if (parts.length === 3) result.type = parts[2].trim();
      if (parts.length === 2) result.format = parts[1].trim();
    }
  }

  // Remove "tracking" from type if present
  if (result.type.toLowerCase() === 'tracking' && parts.length >= 5) {
    result.type = parts[parts.length - 2].trim();
  }

  return result;
}

function findColumnIndex_(headers, aliases) {
  // Exact match first
  for (var a = 0; a < aliases.length; a++) {
    for (var h = 0; h < headers.length; h++) {
      if (headers[h].toLowerCase().trim() === aliases[a].toLowerCase().trim()) return h;
    }
  }
  // Partial match fallback
  for (var a2 = 0; a2 < aliases.length; a2++) {
    for (var h2 = 0; h2 < headers.length; h2++) {
      if (headers[h2].toLowerCase().indexOf(aliases[a2].toLowerCase()) >= 0) return h2;
    }
  }
  return -1;
}

// ============ UTILITIES ============

function cleanValue_(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseNumber_(val) {
  if (val === null || val === undefined || val === '') return 0;
  var cleaned = String(val).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  var num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

function formatDate_(date) {
  var y = date.getFullYear();
  var m = String(date.getMonth() + 1).padStart(2, '0');
  var d = String(date.getDate()).padStart(2, '0');
  return y + '/' + m + '/' + d;
}

function sendNotification_(title, body) {
  try {
    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: '[Dashboard] ' + title,
      body: body
    });
  } catch (e) {
    Logger.log('Could not send notification email: ' + e.message);
  }
}

// ============ MANUAL TRIGGERS ============

/**
 * Full import — processes emails and trashes them after.
 */
function testImport() {
  importGemiusReport();
}

/**
 * List all Gemius emails and their attachments (no import).
 */
function listGemiusEmails() {
  var threads = GmailApp.search('from:' + CONFIG.SENDER, 0, 20);
  Logger.log('Found ' + threads.length + ' thread(s)');

  for (var t = 0; t < threads.length; t++) {
    var messages = threads[t].getMessages();
    for (var m = 0; m < messages.length; m++) {
      var msg = messages[m];
      var subject = msg.getSubject();
      var clientId = detectClient_(subject);
      var campaign = extractCampaign_(subject);
      var month = detectMonth_(subject);
      Logger.log(msg.getDate() + ' | ' + subject);
      Logger.log('  client: ' + (clientId || '??? UNKNOWN') + ' | campaign: ' + campaign + ' | month: ' + month);

      var atts = msg.getAttachments();
      for (var a = 0; a < atts.length; a++) {
        Logger.log('  attachment: ' + atts[a].getName() + ' (' + atts[a].getContentType() + ')');
      }
    }
  }
}

/**
 * Inspect headers in the latest attachment (no import).
 */
function inspectHeaders() {
  var emails = findAllGemiusEmails_();
  if (emails.length === 0) { Logger.log('No emails found'); return; }

  var email = emails[emails.length - 1];
  Logger.log('Inspecting: ' + email.getSubject());

  var att = findReportAttachment_(email);
  if (!att) { Logger.log('No attachment found'); return; }

  var data = parseAttachment_(att);
  if (!data || data.length === 0) { Logger.log('No data parsed'); return; }

  Logger.log('Total rows after header detection: ' + data.length);

  Logger.log('=== HEADERS ===');
  for (var i = 0; i < data[0].length; i++) {
    Logger.log('  Col ' + i + ': "' + data[0][i] + '"');
  }

  Logger.log('=== FIRST 5 DATA ROWS ===');
  for (var r = 1; r < Math.min(6, data.length); r++) {
    Logger.log('Row ' + r + ':');
    for (var j = 0; j < data[r].length; j++) {
      Logger.log('  Col ' + j + ': "' + data[r][j] + '"');
    }
    // Test placement parsing if Placement column exists
    var placementIdx = findColumnIndex_(data[0], CONFIG.COLUMN_MAP.placement);
    if (placementIdx >= 0 && data[r][placementIdx]) {
      var parsed = parsePlacement_(String(data[r][placementIdx]));
      Logger.log('  → parsed: publisher=' + parsed.publisher + ', format=' + parsed.format + ', type=' + parsed.type);
    }
  }
}

/**
 * Dry run — parses everything, logs what WOULD be inserted, but doesn't write to Supabase.
 */
function dryRun() {
  validateConfig_();

  var emails = findAllGemiusEmails_();
  Logger.log('Found ' + emails.length + ' email(s)');

  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    var subject = email.getSubject();
    var clientId = detectClient_(subject);
    var month = detectMonth_(subject);
    var campaign = extractCampaign_(subject);

    Logger.log('--- ' + subject + ' ---');
    Logger.log('  client: ' + (clientId || 'UNKNOWN') + ' | campaign: ' + campaign + ' | month: ' + month);

    var att = findReportAttachment_(email);
    if (!att) { Logger.log('  No attachment'); continue; }

    var rawData = parseAttachment_(att);
    if (!rawData) { Logger.log('  Parse failed'); continue; }

    var mapped = mapColumns_(rawData, clientId, campaign, month);
    if (!mapped) { Logger.log('  Mapping failed'); continue; }

    Logger.log('  Would insert ' + mapped.length + ' rows');
    // Show first 3 rows as sample
    for (var j = 0; j < Math.min(3, mapped.length); j++) {
      Logger.log('  ' + JSON.stringify(mapped[j]));
    }
  }
}
