var CONFIG = {
  SPREADSHEET_URL:
    "https://docs.google.com/spreadsheets/d/1Oosq6lDCOltZvZe0UufCGblCQ55if-GBEOmgNrAAhiQ/edit", // <-- ZAMENI
  SHEET_NAME: "Krka Terme", // <-- ime taba u sheetu

  // MODE opcije:
  // 'backfill' = napuni sve podatke od BACKFILL_START do juče (koristi samo prvi put!)
  // 'daily'    = dodaje samo jucerasnje podatke (za svakodnevni schedule)
  MODE: "daily",

  // Od kog datuma da napuni podatke pri backfill-u (format: YYYYMMDD)
  BACKFILL_START: "20260101",
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

  // Odredi date range na osnovu MODE-a
  var dateRange;
  if (CONFIG.MODE === "backfill") {
    // Backfill: od BACKFILL_START do juče
    var yesterday = getYesterdayStr();
    dateRange = CONFIG.BACKFILL_START + "," + yesterday;
    // Pri backfill-u, ocisti sheet i ponovo dodaj header
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    Logger.log("BACKFILL mode: " + dateRange);
  } else {
    // Daily: samo juče
    var yesterday = getYesterdayStr();
    dateRange = yesterday + "," + yesterday;
    Logger.log("DAILY mode: " + dateRange);
  }

  // Query
  var query =
    "SELECT Date, CampaignName, Cost, Impressions, Clicks, Conversions, CostPerConversion " +
    "FROM CAMPAIGN_PERFORMANCE_REPORT " +
    'WHERE CampaignName = "Krka Terme Search 2025 - 2026" ' +
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

  if (data.length > 0) {
    // Dodaj na dno sheeta (append), ne prepisuj
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow + 1, 1, data.length, headers.length).setValues(data);
  }

  Logger.log(
    "Dodato " +
      data.length +
      " redova u Sheet. Ukupno redova: " +
      sheet.getLastRow(),
  );
}

// Pomocna funkcija - vrati jucerasnji datum kao YYYYMMDD
function getYesterdayStr() {
  var d = new Date();
  d.setDate(d.getDate() - 1);
  var yyyy = d.getFullYear();
  var mm = String(d.getMonth() + 1).padStart(2, "0");
  var dd = String(d.getDate()).padStart(2, "0");
  return yyyy + mm + dd;
}
