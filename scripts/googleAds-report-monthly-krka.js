var SPREADSHEET_ID = "13r6O4i_PS3_XekgTxs6adk3Z2rOjozqsPDqnTrsJKlo"; // ID Google Sheet-a
var SHEET_NAME = "Search"; // Ime taba
var CAMPAIGN_NAME = "Krka Terme Search 2025 - 2026"; // Filtriraj samo ovu kampanju

function main() {
  // Prethodni mesec
  var now = new Date();
  var firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);

  var dateFrom = Utilities.formatDate(
    firstDayPrev,
    AdsApp.currentAccount().getTimeZone(),
    "yyyyMMdd",
  );
  var dateTo = Utilities.formatDate(
    lastDayPrev,
    AdsApp.currentAccount().getTimeZone(),
    "yyyyMMdd",
  );

  Logger.log("Period: " + dateFrom + " - " + dateTo);

  // AWQL query - Ad Group level
  var query =
    "SELECT AdGroupName, Impressions, Clicks, Ctr, Cost " +
    "FROM ADGROUP_PERFORMANCE_REPORT " +
    "WHERE Impressions > 0 " +
    'AND CampaignName = "' +
    CAMPAIGN_NAME +
    '" ' +
    "DURING " +
    dateFrom +
    "," +
    dateTo;

  var report = AdsApp.report(query);
  var rows = report.rows();

  // Sakupljanje podataka
  var data = [];
  while (rows.hasNext()) {
    var row = rows.next();
    data.push([
      row["AdGroupName"],
      parseInt(row["Impressions"].replace(/,/g, ""), 10),
      parseInt(row["Clicks"].replace(/,/g, ""), 10),
      row["Ctr"],
      parseFloat(row["Cost"].replace(/,/g, "")),
    ]);
  }

  Logger.log("Pronadjeno " + data.length + " ad grupa");

  if (data.length === 0) {
    Logger.log("Nema podataka za prethodni mesec");
    return;
  }

  // Sortiranje po Impressions desc
  data.sort(function (a, b) {
    return b[1] - a[1];
  });

  // Upis u Sheet
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  // Ocisti prethodne podatke
  sheet.clear();

  // Red 1: Zaglavlje tabele
  var headers = ["Ad group", "Impressions", "Clicks", "CTR", "Budget"];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Red 2+: Podaci
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);

  // Total red
  var totalRow = data.length + 2;
  sheet.getRange(totalRow, 1).setValue("Total");
  sheet.getRange(totalRow, 2).setFormula("=SUM(B2:B" + (totalRow - 1) + ")");
  sheet.getRange(totalRow, 3).setFormula("=SUM(C2:C" + (totalRow - 1) + ")");
  sheet
    .getRange(totalRow, 4)
    .setFormula(
      "=IF(B" + totalRow + ">0,C" + totalRow + "/B" + totalRow + "*100,0)",
    );
  sheet.getRange(totalRow, 5).setFormula("=SUM(E2:E" + (totalRow - 1) + ")");

  // Period info sa strane (kolona G) - ne smeta citanju podataka
  var monthLabel = Utilities.formatDate(
    firstDayPrev,
    AdsApp.currentAccount().getTimeZone(),
    "MMMM yyyy",
  );
  sheet.getRange(1, 7).setValue("Period: " + monthLabel);

  Logger.log("Sheet uspesno azuriran: " + data.length + " ad grupa");
}
