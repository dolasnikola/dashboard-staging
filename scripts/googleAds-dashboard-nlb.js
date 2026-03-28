var CONFIG = {
  SPREADSHEET_URL:
    "https://docs.google.com/spreadsheets/d/1Oosq6lDCOltZvZe0UufCGblCQ55if-GBEOmgNrAAhiQ/edit",
  SHEET_NAME: "NLB",
  // MODE opcije:
  // 'backfill' = napuni sve podatke od BACKFILL_START do juče (koristi samo prvi put!)
  // 'daily'    = dodaje jucerasnje podatke + PREPISUJE prethodna LOOKBACK_DAYS dana
  MODE: "daily",
  // Od kog datuma da napuni podatke pri backfill-u (format: YYYYMMDD)
  BACKFILL_START: "20260101",
  // Koliko dana unazad da prepisuje podatke (conversion lag korekcija)
  LOOKBACK_DAYS: 3,
};

function main() {
  var spreadsheet = SpreadsheetApp.openByUrl(CONFIG.SPREADSHEET_URL);
  var sheet = spreadsheet.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.SHEET_NAME);
  }

  var headers = [
    "Date",
    "Campaign",
    "Cost",
    "Impr.",
    "Clicks",
    "Conversions",
    "Cost / conv.",
  ];

  // Ako je sheet prazan, dodaj header
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  }

  if (CONFIG.MODE === "backfill") {
    runBackfill(sheet, headers);
  } else {
    runDaily(sheet, headers);
  }
}

// ============================================================
// BACKFILL - isto kao pre, ocisti sve i napuni od pocetka
// ============================================================
function runBackfill(sheet, headers) {
  var yesterday = getDateStr(1);
  var dateRange = CONFIG.BACKFILL_START + "," + yesterday;

  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");

  Logger.log("BACKFILL mode: " + dateRange);

  var data = fetchAdsData(dateRange);

  if (data.length > 0) {
    sheet.getRange(2, 1, data.length, headers.length).setValues(data);
  }

  Logger.log("Backfill zavrsen. Ukupno redova: " + data.length);
}

// ============================================================
// DAILY - jucerasnji dan + lookback korekcija prethodnih dana
// ============================================================
function runDaily(sheet, headers) {
  // Datumski opseg: od (juče - LOOKBACK_DAYS) do juče
  // Npr. ako je LOOKBACK_DAYS = 3 i danas je 16. mart:
  //   vuče podatke za 12, 13, 14, 15. mart
  //   (15. = juče = novi unos, 12-14. = korekcija starih)
  var lookbackStart = getDateStr(CONFIG.LOOKBACK_DAYS + 1); // najstariji dan za korekciju
  var yesterday = getDateStr(1);
  var dateRange = lookbackStart + "," + yesterday;

  Logger.log("DAILY mode sa lookback: " + dateRange);

  // 1) Povuci sveze podatke iz Google Ads za ceo lookback period
  var freshData = fetchAdsData(dateRange);

  if (freshData.length === 0) {
    Logger.log("Nema podataka za period " + dateRange);
    return;
  }

  // 2) Napravi set datuma koji treba da se prepisu
  var datesToReplace = {};
  for (var i = 0; i < freshData.length; i++) {
    datesToReplace[freshData[i][0]] = true; // freshData[i][0] = Date kolona
  }

  // 3) Procitaj postojece podatke iz sheeta (bez headera)
  var lastRow = sheet.getLastRow();
  var existingData = [];

  if (lastRow > 1) {
    existingData = sheet
      .getRange(2, 1, lastRow - 1, headers.length)
      .getValues();
  }

  // 4) Filtriraj - zadrzi sve redove OSIM onih ciji datum je u lookback periodu
  var keptData = [];
  var removedCount = 0;

  for (var j = 0; j < existingData.length; j++) {
    var rowDate = existingData[j][0]; // moze biti Date objekat ili string

    // Konvertuj u string format YYYY-MM-DD za poredjenje
    var dateStr = normalizeDate(rowDate);

    if (datesToReplace[dateStr]) {
      removedCount++;
      // preskoci - ovaj red ce biti zamenjen svezim podacima
    } else {
      keptData.push(existingData[j]);
    }
  }

  // 5) Spoji stare (filtrirane) + nove sveze podatke
  var finalData = keptData.concat(freshData);

  // 6) Ocisti sheet i upisi sve
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");

  if (finalData.length > 0) {
    sheet.getRange(2, 1, finalData.length, headers.length).setValues(finalData);
  }

  Logger.log(
    "Lookback korekcija: obrisano " +
      removedCount +
      " starih redova, dodato " +
      freshData.length +
      " svezih.",
  );
  Logger.log("Ukupno redova u sheetu: " + (finalData.length + 1));
}

// ============================================================
// FETCH podataka iz Google Ads
// ============================================================
function fetchAdsData(dateRange) {
  var query =
    "SELECT Date, CampaignName, Cost, Impressions, Clicks, Conversions, CostPerConversion " +
    "FROM CAMPAIGN_PERFORMANCE_REPORT " +
    "WHERE CampaignStatus = ENABLED AND Cost > 0 " +
    "DURING " +
    dateRange;

  var report = AdsApp.report(query);
  var rows = report.rows();
  var data = [];

  while (rows.hasNext()) {
    var row = rows.next();
    data.push([
      row["Date"],
      row["CampaignName"],
      parseFloat(row["Cost"].replace(/,/g, "")) || 0,
      parseInt(row["Impressions"].replace(/,/g, "")) || 0,
      parseInt(row["Clicks"].replace(/,/g, "")) || 0,
      parseFloat(row["Conversions"].replace(/,/g, "")) || 0,
      parseFloat(row["CostPerConversion"].replace(/,/g, "")) || 0,
    ]);
  }

  return data;
}

// ============================================================
// POMOCNE FUNKCIJE
// ============================================================

// Vrati datum kao YYYYMMDD string, N dana pre danas
function getDateStr(daysAgo) {
  var d = new Date();
  d.setDate(d.getDate() - daysAgo);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return yyyy + mm + dd;
}

// Normalizuj datum u YYYY-MM-DD string (za poredjenje sa Google Ads formatom)
// Google Ads vraca datume kao "2026-03-15"
// Sheet moze da ih cuva kao Date objekat ili string
function normalizeDate(dateValue) {
  if (dateValue instanceof Date) {
    var yyyy = dateValue.getFullYear();
    var mm = String(dateValue.getMonth() + 1).padStart(2, "0");
    var dd = String(dateValue.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
  }
  // Ako je vec string, vrati kao sto jeste (pretpostavka: YYYY-MM-DD format)
  return String(dateValue);
}
