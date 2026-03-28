var SPREADSHEET_ID = "13r6O4i_PS3_XekgTxs6adk3Z2rOjozqsPDqnTrsJKlo";
var SHEET_NAME = "Meta";
var AD_ACCOUNT_ID = "act_405576035057636";
var ACCESS_TOKEN =
  "EAAbyJBf3mpUBQySRWo4HZCdAHX4sV2mm4CGZAVZAsU5dik92HD9dT5tIA2uPIphgOD0AKgo2S94ZBRVQsBUKrVEZB6CmqaCaVil0zkhoJ1P3VsEyxTtYpMPO1QUENMYvipXoqCXvvNTSbAfrpwHefSZBAzH6lm45u35ZCSXrOOq6weTcZBtZBLsVcV7EsWK91";
var CAMPAIGN_FILTER = "Krka Terme"; // Filtrira kampanje koje sadrze ovaj string u imenu

var API_VERSION = "v21.0";
var BASE_URL = "https://graph.facebook.com/" + API_VERSION;

function main() {
  var now = new Date();
  var firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0);

  var dateFrom = Utilities.formatDate(
    firstDayPrev,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd",
  );
  var dateTo = Utilities.formatDate(
    lastDayPrev,
    Session.getScriptTimeZone(),
    "yyyy-MM-dd",
  );
  var timeRange = encodeURIComponent(
    '{"since":"' + dateFrom + '","until":"' + dateTo + '"}',
  );

  Logger.log("Period: " + dateFrom + " - " + dateTo);

  // Jedan API call - dohvati ad set insights filtriran po campaign imenu
  var filtering = encodeURIComponent(
    '[{"field":"campaign.name","operator":"CONTAIN","value":"' +
      CAMPAIGN_FILTER +
      '"}]',
  );
  var insightsUrl =
    BASE_URL +
    "/" +
    AD_ACCOUNT_ID +
    "/insights" +
    "?fields=adset_name,reach,impressions,clicks,ctr,spend" +
    "&level=adset" +
    "&filtering=" +
    filtering +
    "&time_range=" +
    timeRange +
    "&limit=100" +
    "&access_token=" +
    ACCESS_TOKEN;

  var response = UrlFetchApp.fetch(insightsUrl, { muteHttpExceptions: true });
  var result = JSON.parse(response.getContentText());

  if (!result.data || result.data.length === 0) {
    Logger.log("Nema podataka za prethodni mesec");
    return;
  }

  Logger.log("Pronadjeno " + result.data.length + " ad setova");

  // Parsiraj podatke
  var data = [];
  for (var i = 0; i < result.data.length; i++) {
    var ad = result.data[i];
    data.push([
      ad.adset_name || "",
      parseInt(ad.reach || 0, 10),
      parseInt(ad.impressions || 0, 10),
      parseInt(ad.clicks || 0, 10),
      parseFloat(ad.ctr || 0).toFixed(2) + "%",
      parseFloat(ad.spend || 0),
    ]);
  }

  // Sortiranje po Impressions desc
  data.sort(function (a, b) {
    return b[2] - a[2];
  });

  // Upis u Sheet
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  sheet.clear();

  // Red 1: Header
  var headers = [
    "Campaign",
    "Reach",
    "Impressions",
    "Clicks (all)",
    "CTR (all)",
    "Amount spent",
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Red 2+: Ad setovi
  sheet.getRange(2, 1, data.length, headers.length).setValues(data);

  // Total red
  var totalRow = data.length + 2;
  sheet.getRange(totalRow, 1).setValue("Total");
  sheet.getRange(totalRow, 2).setFormula("=SUM(B2:B" + (totalRow - 1) + ")");
  sheet.getRange(totalRow, 3).setFormula("=SUM(C2:C" + (totalRow - 1) + ")");
  sheet.getRange(totalRow, 4).setFormula("=SUM(D2:D" + (totalRow - 1) + ")");
  sheet
    .getRange(totalRow, 5)
    .setFormula(
      "=IF(C" + totalRow + ">0,D" + totalRow + "/C" + totalRow + "*100,0)",
    );
  sheet.getRange(totalRow, 6).setFormula("=SUM(F2:F" + (totalRow - 1) + ")");

  // Period sa strane
  var monthLabel = Utilities.formatDate(
    firstDayPrev,
    Session.getScriptTimeZone(),
    "MMMM yyyy",
  );
  sheet.getRange(1, 8).setValue("Period: " + monthLabel);

  Logger.log("Sheet uspesno azuriran: " + data.length + " ad setova");
}
