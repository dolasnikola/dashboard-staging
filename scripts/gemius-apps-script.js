/**
 * Gemius DirectEffect → Google Sheet importer
 *
 * Reads ALL Gemius emails, detects client from subject line,
 * and populates the sheet with: client | month | publisher | format | impressions | clicks | type
 *
 * Each month the script clears ALL previous data and writes fresh rows.
 * Only the current month's data lives in the sheet — no accumulation.
 *
 * Email subject format: "Report: Klijent - Kampanja - Mesec/Godina"
 * Example: "Report: NLB Stednja Mart 2026"
 *
 * SETUP:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Paste this entire file
 * 3. Enable Drive API: Services → + → Drive API → Add
 * 4. First run: authorize Gmail + Sheets + Drive access
 * 5. Run `listGemiusEmails` to verify emails are found
 * 6. Run `inspectHeaders` to check column names
 * 7. Adjust COLUMN_MAP and CLIENT_MAP as needed
 * 8. Run `testImport` to test
 * 9. Set up trigger: Edit → Triggers → Add trigger
 *    - Function: importGemiusReport
 *    - Event source: Time-driven
 *    - Type: Month timer
 *    - Day of month: 2
 *    - Time: 08:00–09:00
 */

// ============ CONFIGURATION ============

const CONFIG = {
  // Gmail search query
  SENDER: 'no-reply@gde.gemius.com',
  SEARCH_QUERY: 'from:no-reply@gde.gemius.com has:attachment',

  // How many days back to search for emails
  SEARCH_DAYS_BACK: 10,

  // Sheet name where data goes (tab name)
  SHEET_NAME: 'Local Display',

  // Column mapping: sheet column → Gemius report column header
  COLUMN_MAP: {
    publisher:   ['Publisher', 'Site', 'Website', 'Portal', 'Wydawca'],
    format:      ['Format', 'Creative size', 'Size', 'Banner size', 'Kreacja'],
    impressions: ['Impressions', 'Impr.', 'Impr', 'Views', 'Odsłony'],
    clicks:      ['Clicks', 'Click', 'Kliknięcia'],
    type:        ['Type', 'Creative type', 'Creative name', 'Typ', 'Ad type']
  },

  HEADER_ROW: 1,
  DATA_START_ROW: 2
};

/**
 * CLIENT MAP — keywords from email subject → client_id
 *
 * Script reads the subject, searches for keywords (case-insensitive),
 * and assigns the matching client_id.
 *
 * Keywords are checked in order — first match wins.
 * Use the most specific keyword first to avoid false matches.
 *
 * To add a new client:
 *   { keywords: ['Keyword1', 'Keyword2'], client_id: 'client-slug' }
 */
const CLIENT_MAP = [
  { keywords: ['NLB', 'Komercijalna'],      client_id: 'nlb'          },
  { keywords: ['Urban Garden', 'Urban'],     client_id: 'urban-garden' },
  { keywords: ['Krka', 'Terme'],             client_id: 'krka'         },
  // ↓ Dodaj nove klijente ovde ↓
  // { keywords: ['Novi Klijent'],            client_id: 'novi-klijent' },
];

// ============ MAIN FUNCTION ============

function importGemiusReport() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
  }

  // Find ALL Gemius emails
  const emails = findAllGemiusEmails_();
  if (emails.length === 0) {
    Logger.log('No Gemius emails found in the last ' + CONFIG.SEARCH_DAYS_BACK + ' days.');
    sendNotification_('Gemius Import', 'No Gemius emails found. Check sender address or search window.');
    return;
  }

  Logger.log('Found ' + emails.length + ' Gemius email(s).');

  // Clear sheet before importing fresh batch
  clearDataRows_(sheet);

  let totalRows = 0;
  const processed = [];
  const failed = [];

  for (const email of emails) {
    const subject = email.getSubject();
    Logger.log('--- Processing: ' + subject + ' ---');

    // Detect client from subject
    const clientId = detectClient_(subject);
    if (!clientId) {
      Logger.log('WARNING: Could not detect client from subject: "' + subject + '"');
      failed.push(subject + ' (unknown client)');
      continue;
    }
    Logger.log('Detected client: ' + clientId);

    // Detect month from subject
    const month = detectMonth_(subject);
    Logger.log('Detected month: ' + month);

    // Get attachment
    const attachment = findReportAttachment_(email);
    if (!attachment) {
      Logger.log('WARNING: No XLSX/CSV attachment in: ' + subject);
      failed.push(subject + ' (no attachment)');
      continue;
    }

    // Parse attachment
    const rawData = parseAttachment_(attachment);
    if (!rawData || rawData.length < 2) {
      Logger.log('WARNING: Could not parse attachment for: ' + subject);
      failed.push(subject + ' (parse error)');
      continue;
    }

    // Map columns
    const mappedData = mapColumns_(rawData, clientId, month);
    if (!mappedData || mappedData.length === 0) {
      Logger.log('WARNING: Column mapping failed for: ' + subject);
      failed.push(subject + ' (mapping error)');
      continue;
    }

    // Append to sheet
    appendToSheet_(sheet, mappedData);
    totalRows += mappedData.length;
    processed.push(clientId + ' / ' + month + ' (' + mappedData.length + ' rows)');

    // Delete processed email
    email.moveToTrash();
    Logger.log('Email moved to trash: ' + subject);
  }

  // Add timestamp at the end
  addTimestamp_(sheet);

  // Summary
  let msg = 'Imported ' + totalRows + ' rows from ' + processed.length + ' email(s).\n';
  msg += 'Clients: ' + processed.join(', ');
  if (failed.length > 0) {
    msg += '\n\nFailed (' + failed.length + '):\n' + failed.join('\n');
  }
  Logger.log(msg);
  sendNotification_('Gemius Import ✓', msg);
}

// ============ CLIENT & MONTH DETECTION ============

function detectClient_(subject) {
  const subjectLower = subject.toLowerCase();

  for (const entry of CLIENT_MAP) {
    for (const keyword of entry.keywords) {
      if (subjectLower.includes(keyword.toLowerCase())) {
        return entry.client_id;
      }
    }
  }

  return null; // Unknown client
}

/**
 * Extracts month from email subject
 * Supports Serbian and English month names + numeric formats
 * "Report: NLB Stednja Mart 2026" → "2026-03"
 * "Report: Krka April 2026"       → "2026-04"
 * "Report: Urban 03/2026"         → "2026-03"
 */
const MONTH_NAMES = {
  // Serbian
  'januar': '01', 'februar': '02', 'mart': '03', 'april': '04',
  'maj': '05', 'jun': '06', 'jul': '07', 'avgust': '08',
  'septembar': '09', 'oktobar': '10', 'novembar': '11', 'decembar': '12',
  // English
  'january': '01', 'february': '02', 'march': '03',
  'may': '05', 'june': '06', 'july': '07', 'august': '08',
  'september': '09', 'october': '10', 'november': '11', 'december': '12'
};

function detectMonth_(subject) {
  const subjectLower = subject.toLowerCase();

  // Try "Mesec Godina" pattern (e.g., "Mart 2026")
  for (const [name, num] of Object.entries(MONTH_NAMES)) {
    const regex = new RegExp(name + '\\s*(\\d{4})', 'i');
    const match = subjectLower.match(regex);
    if (match) {
      return match[1] + '-' + num;
    }
  }

  // Try numeric "MM/YYYY" or "MM-YYYY" or "MM.YYYY"
  const numericMatch = subjectLower.match(/(\d{1,2})[\/\-\.](\d{4})/);
  if (numericMatch) {
    const mm = numericMatch[1].padStart(2, '0');
    return numericMatch[2] + '-' + mm;
  }

  // Fallback: previous month (script runs on 2nd, so data is for previous month)
  const now = new Date();
  now.setMonth(now.getMonth() - 1);
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  Logger.log('WARNING: Could not detect month from subject, using fallback: ' + y + '-' + m);
  return y + '-' + m;
}

// ============ GMAIL FUNCTIONS ============

function findAllGemiusEmails_() {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - CONFIG.SEARCH_DAYS_BACK);

  const query = CONFIG.SEARCH_QUERY + ' after:' + formatDate_(cutoffDate);
  const threads = GmailApp.search(query, 0, 50);

  // Collect all messages from all threads
  const emails = [];
  for (const thread of threads) {
    const messages = thread.getMessages();
    for (const msg of messages) {
      // Only include messages from the Gemius sender
      if (msg.getFrom().includes(CONFIG.SENDER)) {
        emails.push(msg);
      }
    }
  }

  // Sort by date (oldest first — so sheet has consistent order)
  emails.sort((a, b) => a.getDate() - b.getDate());
  return emails;
}

function findReportAttachment_(message) {
  const attachments = message.getAttachments();

  for (const att of attachments) {
    const name = att.getName().toLowerCase();
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
      return att;
    }
  }

  return null;
}

// ============ PARSING ============

function parseAttachment_(attachment) {
  const name = attachment.getName().toLowerCase();

  if (name.endsWith('.csv')) {
    return parseCSV_(attachment.getDataAsString());
  }

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseXLSX_(attachment);
  }

  return null;
}

function parseCSV_(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  return lines.map(line => parseCSVLine_(line));
}

function parseCSVLine_(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
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
  const blob = attachment.copyBlob();
  blob.setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

  const tempFile = Drive.Files.insert(
    { title: '_gemius_temp_import', mimeType: 'application/vnd.google-apps.spreadsheet' },
    blob,
    { convert: true }
  );

  try {
    const tempSS = SpreadsheetApp.openById(tempFile.id);
    const tempSheet = tempSS.getSheets()[0];
    const data = tempSheet.getDataRange().getValues();
    return data.map(row => row.map(cell => String(cell)));
  } finally {
    DriveApp.getFileById(tempFile.id).setTrashed(true);
  }
}

// ============ COLUMN MAPPING ============

function mapColumns_(rawData, clientId, month) {
  const headers = rawData[0];
  const dataRows = rawData.slice(1);

  const indices = {};
  for (const [field, aliases] of Object.entries(CONFIG.COLUMN_MAP)) {
    indices[field] = findColumnIndex_(headers, aliases);
  }

  Logger.log('Column mapping for ' + clientId + ':');
  for (const [field, idx] of Object.entries(indices)) {
    Logger.log('  ' + field + ' → ' + (idx >= 0 ? 'col ' + idx + ' (' + headers[idx] + ')' : 'NOT FOUND'));
  }

  if (indices.publisher < 0 || indices.impressions < 0) {
    Logger.log('ERROR: Missing publisher or impressions column.');
    Logger.log('Available headers: ' + headers.join(' | '));
    return null;
  }

  const result = [];
  for (const row of dataRows) {
    const publisher = cleanValue_(row[indices.publisher]);
    const impressions = parseNumber_(row[indices.impressions]);

    // Skip empty/summary rows
    if (!publisher || publisher.toLowerCase() === 'total' || publisher.toLowerCase() === 'sum') continue;
    if (!publisher && impressions === 0) continue;

    result.push({
      client:      clientId,
      month:       month,
      publisher:   publisher,
      format:      indices.format >= 0 ? cleanValue_(row[indices.format]) : '',
      impressions: impressions,
      clicks:      indices.clicks >= 0 ? parseNumber_(row[indices.clicks]) : 0,
      type:        indices.type >= 0 ? cleanValue_(row[indices.type]) : ''
    });
  }

  return result;
}

function findColumnIndex_(headers, aliases) {
  // Exact match first
  for (const alias of aliases) {
    const idx = headers.findIndex(h =>
      h.toLowerCase().trim() === alias.toLowerCase().trim()
    );
    if (idx >= 0) return idx;
  }

  // Partial match fallback
  for (const alias of aliases) {
    const idx = headers.findIndex(h =>
      h.toLowerCase().includes(alias.toLowerCase())
    );
    if (idx >= 0) return idx;
  }

  return -1;
}

// ============ SHEET WRITING ============

function clearDataRows_(sheet) {
  const headers = ['client', 'month', 'publisher', 'format', 'impressions', 'clicks', 'type'];

  // Log what's being cleared
  const oldLastRow = sheet.getLastRow();
  if (oldLastRow > 1) {
    Logger.log('Clearing ' + (oldLastRow - 1) + ' previous data rows.');
  }

  sheet.clearContents();

  // Write header row
  sheet.getRange(CONFIG.HEADER_ROW, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(CONFIG.HEADER_ROW, 1, 1, headers.length)
    .setFontWeight('bold')
    .setBackground('#f3f4f6');
}

function appendToSheet_(sheet, data) {
  if (data.length === 0) return;

  // Find first empty row
  const lastRow = sheet.getLastRow();
  const startRow = lastRow + 1;

  const rows = data.map(d => [d.client, d.month, d.publisher, d.format, d.impressions, d.clicks, d.type]);
  sheet.getRange(startRow, 1, rows.length, 7).setValues(rows);

  // Format impressions and clicks as numbers (columns 5 and 6 now)
  sheet.getRange(startRow, 5, rows.length, 2).setNumberFormat('#,##0');
}

function addTimestamp_(sheet) {
  const lastRow = sheet.getLastRow() + 1;
  sheet.getRange(lastRow, 1).setValue('Last import: ' + new Date().toLocaleString('sr-RS'));
  sheet.getRange(lastRow, 1).setFontColor('#9ca3af').setFontSize(9);

  // Auto-resize all columns
  for (let i = 1; i <= 7; i++) {
    sheet.autoResizeColumn(i);
  }
}

// ============ UTILITIES ============

function cleanValue_(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseNumber_(val) {
  if (val === null || val === undefined || val === '') return 0;
  const cleaned = String(val).replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num);
}

function formatDate_(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
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
 * Run manually to test full import pipeline
 */
function testImport() {
  importGemiusReport();
}

/**
 * Run manually to list all Gemius emails and their attachments
 */
function listGemiusEmails() {
  const threads = GmailApp.search('from:' + CONFIG.SENDER, 0, 20);
  Logger.log('Found ' + threads.length + ' thread(s)');

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const subject = msg.getSubject();
      const clientId = detectClient_(subject);
      Logger.log(msg.getDate() + ' | ' + subject + ' → client: ' + (clientId || '??? UNKNOWN'));

      const atts = msg.getAttachments();
      for (const att of atts) {
        Logger.log('  📎 ' + att.getName() + ' (' + att.getContentType() + ')');
      }
    }
  }
}

/**
 * Run manually to inspect headers in the latest attachment
 */
function inspectHeaders() {
  const emails = findAllGemiusEmails_();
  if (emails.length === 0) { Logger.log('No emails found'); return; }

  const email = emails[emails.length - 1]; // Most recent
  Logger.log('Inspecting: ' + email.getSubject());

  const att = findReportAttachment_(email);
  if (!att) { Logger.log('No attachment found'); return; }

  const data = parseAttachment_(att);
  if (!data || data.length === 0) { Logger.log('No data parsed'); return; }

  Logger.log('=== HEADERS (row 1) ===');
  data[0].forEach((h, i) => Logger.log('  Col ' + i + ': "' + h + '"'));

  Logger.log('=== FIRST DATA ROW ===');
  if (data.length > 1) {
    data[1].forEach((v, i) => Logger.log('  Col ' + i + ': "' + v + '"'));
  }
}

/**
 * Run manually to test client detection without importing
 */
function testClientDetection() {
  const threads = GmailApp.search('from:' + CONFIG.SENDER, 0, 20);

  for (const thread of threads) {
    for (const msg of thread.getMessages()) {
      const subject = msg.getSubject();
      const clientId = detectClient_(subject);
      Logger.log(subject);
      Logger.log('  → ' + (clientId ? '✓ ' + clientId : '✗ UNKNOWN — add to CLIENT_MAP!'));
    }
  }
}
