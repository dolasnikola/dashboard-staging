/**
 * =============================================================
 * META ADS DAILY REPORT — Google Apps Script
 * =============================================================
 * Automatski vuče daily campaign podatke iz Meta Marketing API
 * i dopisuje ih u Google Sheets.
 *
 * SETUP:
 * 1. Otvori Google Sheet → Extensions → Apps Script
 * 2. Zalepi ovaj kod
 * 3. Popuni CONFIG sekciju ispod (token, account IDs)
 * 4. Pokreni setupDailyTrigger() jednom da aktiviraš automatizaciju
 * 5. Ili pokreni fetchAllAccounts() ručno za test
 * =============================================================
 */

// ======================== CONFIG ========================
const CONFIG = {
  // Tvoj long-lived access token (ističe ~60 dana, zameni kad istekne)
  ACCESS_TOKEN: 'EAAbyJBf3mpUBQ011dyouuu9e1IEomHsxASaPkq91s0cZA0hljATlvkJ18rskXTgZAr2EuC03unJNATL8YFcyzZCmbZC2Anp3kZCEOfuu9WeVzNWCgTJQnUPSZBZAkk4QNKYHqEm35JG9ERDiw9EZCWf3eX9NwFDX52oEOfZCF81xPvsvykiQoWZBaram7pBOnCFpZCP',

  // API verzija
  API_VERSION: 'v25.0',

  // Ad accounts — dodaj/ukloni po potrebi
  ACCOUNTS: [
    {
      id: 'act_459770415075805',   // NLB Komercijalna banka
      sheetName: 'NLB'             // ime tab-a u Google Sheet-u
    },
    {
      id: 'act_405576035057636',   // Krka
      sheetName: 'Krka Terme'            // ime tab-a u Google Sheet-u
    },
    // Odkomentariši kad Urban Garden bude aktivan:
    // {
    //   id: 'act_574823960318014',
    //   sheetName: 'Urban Garden'
    // },
  ],

  // Kolone koje vučemo (matchuje tvoj sheet format)
  FIELDS: 'campaign_name,reach,impressions,clicks,spend',

  // Koliko dana unazad da vuče (1 = juče)
  DAYS_BACK: 1,
};

// ======================== MAIN FUNCTIONS ========================

/**
 * Vuče podatke za sve account-e i upisuje u odgovarajuće tabove
 */
function fetchAllAccounts() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const yesterday = getDateString(CONFIG.DAYS_BACK);

  CONFIG.ACCOUNTS.forEach(account => {
    try {
      const data = fetchInsights(account.id, yesterday, yesterday);
      if (data && data.length > 0) {
        writeToSheet(ss, account.sheetName, data, yesterday);
        Logger.log(`✅ ${account.sheetName}: ${data.length} kampanja upisano za ${yesterday}`);
      } else {
        Logger.log(`ℹ️ ${account.sheetName}: Nema podataka za ${yesterday}`);
      }
    } catch (e) {
      Logger.log(`❌ ${account.sheetName}: Greška — ${e.message}`);
    }
  });
}

/**
 * Vuče podatke za custom period (za backfill istorijskih podataka)
 * Pokreni ručno iz Apps Script editora
 */
function fetchCustomRange() {
  const startDate = '2026-03-01';  // <-- izmeni po potrebi
  const endDate = '2026-03-15';    // <-- izmeni po potrebi
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  CONFIG.ACCOUNTS.forEach(account => {
    try {
      const data = fetchInsights(account.id, startDate, endDate);
      if (data && data.length > 0) {
        writeToSheet(ss, account.sheetName, data);
        Logger.log(`✅ ${account.sheetName}: ${data.length} redova za ${startDate} — ${endDate}`);
      } else {
        Logger.log(`ℹ️ ${account.sheetName}: Nema podataka za period`);
      }
    } catch (e) {
      Logger.log(`❌ ${account.sheetName}: Greška — ${e.message}`);
    }
  });
}

// ======================== API CALL ========================

/**
 * Poziva Meta Insights API za dati account i period
 */
function fetchInsights(accountId, since, until) {
const baseUrl = `https://graph.facebook.com/${CONFIG.API_VERSION}/${accountId}/insights`;
  
  const params = {
    'fields': CONFIG.FIELDS,
    'level': 'campaign',
    'time_range': JSON.stringify({since: since, until: until}),
    'time_increment': '1',
    'limit': '500',
    'access_token': CONFIG.ACCESS_TOKEN
  };
  
  const queryString = Object.keys(params).map(key => 
    `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`
  ).join('&');
  
  const url = `${baseUrl}?${queryString}`;

  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(response.getContentText());

  if (json.error) {
    throw new Error(`API Error: ${json.error.message}`);
  }

  // Pokupi sve stranice rezultata
  let allData = json.data || [];
  let nextPage = json.paging && json.paging.next;

  while (nextPage) {
    const pageResponse = UrlFetchApp.fetch(nextPage, { muteHttpExceptions: true });
    const pageJson = JSON.parse(pageResponse.getContentText());
    allData = allData.concat(pageJson.data || []);
    nextPage = pageJson.paging && pageJson.paging.next;
  }

  return allData;
}

// ======================== SHEET WRITING ========================

/**
 * Upisuje podatke u odgovarajući tab
 * Format: Day | Campaign name | Reach | Impressions | Clicks (all) | Amount spent (EUR)
 */
function writeToSheet(spreadsheet, sheetName, data, dateOverride) {
  let sheet = spreadsheet.getSheetByName(sheetName);

  // Kreiraj tab ako ne postoji
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
    // Dodaj header
    sheet.getRange(1, 1, 1, 6).setValues([[
      'Day', 'Campaign name', 'Reach', 'Impressions', 'Clicks (all)', 'Amount spent (EUR)'
    ]]);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
  }

  // Pripremi redove
  const rows = data.map(row => [
    row.date_start || dateOverride,
    row.campaign_name || '',
    parseInt(row.reach || 0),
    parseInt(row.impressions || 0),
    parseInt(row.clicks || 0),
    parseFloat(row.spend || 0)
  ]);

  // Dodaj na kraj sheet-a
  const lastRow = sheet.getLastRow();
  sheet.getRange(lastRow + 1, 1, rows.length, 6).setValues(rows);

  // Formatiraj "Amount spent" kolonu kao broj sa 2 decimale
  const spendRange = sheet.getRange(lastRow + 1, 6, rows.length, 1);
  spendRange.setNumberFormat('#,##0.00');
}

// ======================== TRIGGER SETUP ========================

/**
 * Pokreni jednom da postaviš automatski daily trigger
 * Script će se izvršavati svaki dan između 7-8h ujutru
 */
function setupDailyTrigger() {
  // Obriši postojeće triggere za ovu funkciju
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'fetchAllAccounts') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  // Postavi novi daily trigger
  ScriptApp.newTrigger('fetchAllAccounts')
    .timeBased()
    .everyDays(1)
    .atHour(7)
    .create();

  Logger.log('✅ Daily trigger postavljen — izvršava se svaki dan u 7h');
}

/**
 * Uklanja sve triggere (ako treba da zaustaviš automatizaciju)
 */
function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(trigger => {
    ScriptApp.deleteTrigger(trigger);
  });
  Logger.log('🛑 Svi trigeri uklonjeni');
}

// ======================== HELPERS ========================

/**
 * Vraća datum string (YYYY-MM-DD) za N dana unazad
 */
function getDateString(daysBack) {
  const date = new Date();
  date.setDate(date.getDate() - daysBack);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

/**
 * Testira da li token radi — pokreni ručno za proveru
 */
function testToken() {
  const url = `https://graph.facebook.com/${CONFIG.API_VERSION}/me?access_token=${CONFIG.ACCESS_TOKEN}`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(response.getContentText());
  Logger.log(json.error ? `❌ Token error: ${json.error.message}` : `✅ Token OK — User: ${json.name}`);
}

/**
 * Provera kad token ističe
 */
function checkTokenExpiry() {
  const url = `https://graph.facebook.com/debug_token?input_token=${CONFIG.ACCESS_TOKEN}&access_token=${CONFIG.ACCESS_TOKEN}`;
  const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const json = JSON.parse(response.getContentText());

  if (json.data && json.data.expires_at) {
    const expiry = new Date(json.data.expires_at * 1000);
    const daysLeft = Math.ceil((expiry - new Date()) / (1000 * 60 * 60 * 24));
    Logger.log(`🔑 Token ističe: ${expiry.toDateString()} (još ${daysLeft} dana)`);

    // Pošalji email upozorenje ako ističe za manje od 7 dana
    if (daysLeft <= 7) {
      MailApp.sendEmail(
        Session.getActiveUser().getEmail(),
        '⚠️ Meta API Token ističe uskoro!',
        `Tvoj Meta API token ističe za ${daysLeft} dana (${expiry.toDateString()}).\n\nIdi na https://developers.facebook.com/tools/explorer/ da generišeš novi.`
      );
      Logger.log('📧 Email upozorenje poslato!');
    }
  }
}

/**
 * Dnevna provera tokena — dodaj kao poseban trigger ako želiš
 */
function setupTokenCheckTrigger() {
  ScriptApp.newTrigger('checkTokenExpiry')
    .timeBased()
    .everyDays(1)
    .atHour(6)
    .create();

  Logger.log('✅ Token check trigger postavljen — proverava svaki dan u 6h');
}