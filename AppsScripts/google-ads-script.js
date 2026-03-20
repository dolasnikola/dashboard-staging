// ============================================
// Google Ads Script - Export u Google Sheets
// ============================================
//
// KAKO RADI:
// - Prvi put: pokreni sa MODE = 'backfill' da napuni podatke od pocetka godine
// - Svaki dan: schedule sa MODE = 'daily' - dodaje samo jucerasnje podatke na dno
// - Nikada ne brise stare podatke!
//
// SETUP:
// 1. Otvori Google Ads → Tools & Settings → Bulk Actions → Scripts
// 2. Klikni "+" da napraviš novi script
// 3. Kopiraj ovaj kod
// 4. Zameni SPREADSHEET_URL sa tvojim Sheet URL-om
// 5. Zameni SHEET_NAME sa imenom taba
// 6. PRVI PUT: postavi MODE na 'backfill', klikni Run
// 7. POSLE: promeni MODE na 'daily', Schedule → Daily 23:00-00:00
//
// NAPOMENA: Ovaj script radi na nivou jednog Google Ads accounta.
// Ako imaš MCC, koristi verziju sa MCC dole.
// ============================================

var CONFIG = {
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/1Oosq6lDCOltZvZe0UufCGblCQ55if-GBEOmgNrAAhiQ/edit',  // <-- ZAMENI
  SHEET_NAME: 'Google Ads',  // <-- ime taba u sheetu

  // MODE opcije:
  // 'backfill' = napuni sve podatke od BACKFILL_START do juče (koristi samo prvi put!)
  // 'daily'    = dodaje samo jucerasnje podatke (za svakodnevni schedule)
  MODE: 'daily',

  // Od kog datuma da napuni podatke pri backfill-u (format: YYYYMMDD)
  BACKFILL_START: '20260101'
};

function main() {
  var spreadsheet = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
  var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  var headers = ['Date', 'Campaign', 'Cost', 'Impr.', 'Clicks', 'Conversions', 'Cost / conv.'];

  // Ako je sheet prazan, dodaj header
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  }

  // Odredi date range na osnovu MODE-a
  var dateRange;
  if (CONFIG.MODE === 'backfill') {
    // Backfill: od BACKFILL_START do juče
    var yesterday = getYesterdayStr();
    dateRange = CONFIG.BACKFILL_START + ',' + yesterday;
    // Pri backfill-u, ocisti sheet i ponovo dodaj header
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    Logger.log('BACKFILL mode: ' + dateRange);
  } else {
    // Daily: samo juče
    var yesterday = getYesterdayStr();
    dateRange = yesterday + ',' + yesterday;
    Logger.log('DAILY mode: ' + dateRange);
  }

  // Query
  var query = 'SELECT Date, CampaignName, Cost, Impressions, Clicks, Conversions, CostPerConversion ' +
              'FROM CAMPAIGN_PERFORMANCE_REPORT ' +
              'WHERE CampaignStatus = ENABLED AND Cost > 0 ' +
              'DURING ' + dateRange;

  var report = AdsApp.report(query);
  var rows = report.rows();
  var data = [];

  while (rows.hasNext()) {
    var row = rows.next();
    data.push([
      row['Date'],
      row['CampaignName'],
      parseFloat(row['Cost'].replace(/,/g, '')) || 0,
      parseInt(row['Impressions'].replace(/,/g, '')) || 0,
      parseInt(row['Clicks'].replace(/,/g, '')) || 0,
      parseFloat(row['Conversions'].replace(/,/g, '')) || 0,
      parseFloat(row['CostPerConversion'].replace(/,/g, '')) || 0
    ]);
  }

  if (data.length > 0) {
    // Dodaj na dno sheeta (append), ne prepisuj
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, data.length, headers.length).setValues(data);
  }

  Logger.log('Dodato ' + data.length + ' redova u Sheet. Ukupno redova: ' + sheet.getLastRow());
}

// Pomocna funkcija - vrati jucerasnji datum kao YYYYMMDD
function getYesterdayStr() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return yyyy + mm + dd;
}


// ============================================
// MCC VERZIJA - za vise accounta odjednom
// ============================================
// Koristi ovu verziju ako imas MCC (Manager Account)
// i hoces da vuces podatke za vise klijenata
//
// SETUP:
// 1. Otvori MCC → Tools & Settings → Bulk Actions → Scripts
// 2. Kopiraj MCC verziju dole
// 3. Podesi ACCOUNTS niz sa account ID-ovima i imenima tabova
// 4. PRVI PUT: MODE = 'backfill', Run
// 5. POSLE: MODE = 'daily', Schedule daily
// ============================================

/*
var MCC_CONFIG = {
  SPREADSHEET_URL: 'https://docs.google.com/spreadsheets/d/TVOJ_SHEET_ID/edit',
  MODE: 'daily',  // 'backfill' prvi put, 'daily' posle
  BACKFILL_START: '20260101',
  ACCOUNTS: [
    { id: '123-456-7890', sheetName: 'NLB - Google Ads' },
    { id: '234-567-8901', sheetName: 'Krka - Google Ads' },
    { id: '345-678-9012', sheetName: 'Urban - Google Ads' }
  ]
};

function main() {
  var spreadsheet = SpreadsheetApp.openByUrl(MCC_CONFIG.SPREADSHEET_URL);
  var headers = ['Date', 'Campaign', 'Cost', 'Impr.', 'Clicks', 'Conversions', 'Cost / conv.'];

  var dateRange;
  var yesterday = getYesterdayStr();
  if (MCC_CONFIG.MODE === 'backfill') {
    dateRange = MCC_CONFIG.BACKFILL_START + ',' + yesterday;
  } else {
    dateRange = yesterday + ',' + yesterday;
  }

  MCC_CONFIG.ACCOUNTS.forEach(function(account) {
    var mccAccount = AdsManagerApp.accounts().withIds([account.id]).get();

    if (mccAccount.hasNext()) {
      AdsManagerApp.select(mccAccount.next());

      var sheet = spreadsheet.getSheetByName(account.sheetName);
      if (!sheet) {
        sheet = spreadsheet.insertSheet(account.sheetName);
      }

      // Backfill: ocisti i dodaj header
      if (MCC_CONFIG.MODE === 'backfill') {
        sheet.clear();
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      }

      // Ako je prazan sheet, dodaj header
      if (sheet.getLastRow() === 0) {
        sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
        sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
      }

      var query = 'SELECT Date, CampaignName, Cost, Impressions, Clicks, Conversions, CostPerConversion ' +
                  'FROM CAMPAIGN_PERFORMANCE_REPORT ' +
                  'WHERE CampaignStatus = ENABLED AND Cost > 0 ' +
                  'DURING ' + dateRange;

      var report = AdsApp.report(query);
      var rows = report.rows();
      var data = [];

      while (rows.hasNext()) {
        var row = rows.next();
        data.push([
          row['Date'],
          row['CampaignName'],
          parseFloat(row['Cost'].replace(/,/g, '')) || 0,
          parseInt(row['Impressions'].replace(/,/g, '')) || 0,
          parseInt(row['Clicks'].replace(/,/g, '')) || 0,
          parseFloat(row['Conversions'].replace(/,/g, '')) || 0,
          parseFloat(row['CostPerConversion'].replace(/,/g, '')) || 0
        ]);
      }

      if (data.length > 0) {
        var lastRow = sheet.getLastRow();
        sheet.getRange(lastRow + 1, 1, data.length, headers.length).setValues(data);
      }

      Logger.log('Account ' + account.id + ': dodato ' + data.length + ' redova. Ukupno: ' + sheet.getLastRow());
    }
  });
}

function getYesterdayStr() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return yyyy + mm + dd;
}
*/
