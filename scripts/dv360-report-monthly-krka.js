/**
 * Krka Terme - DV360 (GDN) Monthly Report
 * Instaliraj kao Apps Script povezan sa Google Sheet-om
 * Pokrece se kao scheduled script na pocetku svakog meseca (posle 1.)
 *
 * SETUP:
 * 1. Google Sheet > Extensions > Apps Script
 * 2. Paste ovaj kod
 * 3. Zameni SPREADSHEET_ID sa pravim ID-jem
 * 4. Schedule: Triggers > Add Trigger > main > Time-driven > Monthly, 2nd day
 *    (DV360 report stize 1. u mesecu, skripta treba dan kasnije)
 */

var SPREADSHEET_ID = "13r6O4i_PS3_XekgTxs6adk3Z2rOjozqsPDqnTrsJKlo";
var SHEET_NAME = "GDN";
var REPORT_SUBJECT = "Krka Monthly Report";
var CAMPAIGN_FILTER = "Krka Terme";

function main() {
  // Nadji mail sa DV360 reportom
  var threads = GmailApp.search(
    'subject:"' + REPORT_SUBJECT + '" has:attachment newer_than:5d',
  );

  if (threads.length === 0) {
    Logger.log("Nema maila sa reportom");
    return;
  }

  Logger.log("Pronadjeno " + threads.length + " mailova");

  // Uzmi najnoviji mail
  var message = threads[0].getMessages()[0];
  var attachments = message.getAttachments();

  if (attachments.length === 0) {
    Logger.log("Mail nema attachment");
    return;
  }

  // Parsiraj CSV
  var csv = attachments[0].getDataAsString();
  var rows = Utilities.parseCsv(csv);

  if (rows.length < 2) {
    Logger.log("CSV je prazan");
    return;
  }

  // Nadji indekse kolona iz headera
  var header = rows[0];
  var col = {};
  for (var h = 0; h < header.length; h++) {
    var name = header[h].trim();
    if (name === "Campaign") col.campaign = h;
    if (name === "Insertion Order") col.io = h;
    if (name === "Impressions") col.impressions = h;
    if (name.indexOf("Total Reach") > -1) col.reach = h;
    if (name === "Clicks") col.clicks = h;
    if (name.indexOf("Click Rate") > -1 || name === "CTR") col.ctr = h;
    if (name.indexOf("Media Cost") > -1) col.cost = h;
  }

  Logger.log("Kolone: " + JSON.stringify(col));

  // Filtriraj samo "Krka Terme" redove
  var filteredRows = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var campaignName = row[col.campaign] || "";
    if (campaignName.indexOf(CAMPAIGN_FILTER) > -1) {
      filteredRows.push(row);
    }
  }

  Logger.log(
    "Filtrirano " +
      filteredRows.length +
      ' redova sa "' +
      CAMPAIGN_FILTER +
      '"',
  );

  if (filteredRows.length === 0) {
    Logger.log("Nema podataka za " + CAMPAIGN_FILTER);
    return;
  }

  // Agregiraj po Campaign
  var campaigns = {};
  for (var j = 0; j < filteredRows.length; j++) {
    var r = filteredRows[j];
    var cName = r[col.campaign].trim();
    if (!campaigns[cName]) {
      campaigns[cName] = { impressions: 0, reach: 0, clicks: 0, cost: 0 };
    }
    campaigns[cName].impressions += parseNum(r[col.impressions]);
    campaigns[cName].reach += parseNum(r[col.reach]);
    campaigns[cName].clicks += parseNum(r[col.clicks]);
    campaigns[cName].cost += parseFloat(r[col.cost] || 0);
  }

  // Agregiraj po Insertion Order
  var ios = {};
  for (var k = 0; k < filteredRows.length; k++) {
    var r2 = filteredRows[k];
    var ioName = r2[col.io].trim();
    if (!ios[ioName]) {
      ios[ioName] = { impressions: 0, reach: 0, clicks: 0, cost: 0 };
    }
    ios[ioName].impressions += parseNum(r2[col.impressions]);
    ios[ioName].reach += parseNum(r2[col.reach]);
    ios[ioName].clicks += parseNum(r2[col.clicks]);
    ios[ioName].cost += parseFloat(r2[col.cost] || 0);
  }

  // Pripremi podatke za sheet
  var campaignData = objToRows(campaigns);
  var ioData = objToRows(ios);

  // Upis u Sheet
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }

  sheet.clear();

  var currentRow = 1;

  // === TABELA 1: Campaign ===
  var campaignHeaders = [
    "Campaign",
    "Impressions",
    "Clicks",
    "CTR",
    "CPM",
    "Budget",
  ];
  sheet
    .getRange(currentRow, 1, 1, campaignHeaders.length)
    .setValues([campaignHeaders]);
  currentRow++;

  if (campaignData.length > 0) {
    sheet
      .getRange(currentRow, 1, campaignData.length, campaignHeaders.length)
      .setValues(campaignData);
    currentRow += campaignData.length;

    // Total
    sheet.getRange(currentRow, 1).setValue("Total");
    sheet
      .getRange(currentRow, 2)
      .setFormula("=SUM(B2:B" + (currentRow - 1) + ")");
    sheet
      .getRange(currentRow, 3)
      .setFormula("=SUM(C2:C" + (currentRow - 1) + ")");
    sheet
      .getRange(currentRow, 4)
      .setFormula(
        "=IF(B" +
          currentRow +
          ">0,C" +
          currentRow +
          "/B" +
          currentRow +
          "*100,0)",
      );
    sheet
      .getRange(currentRow, 5)
      .setFormula(
        "=IF(B" +
          currentRow +
          ">0,F" +
          currentRow +
          "/B" +
          currentRow +
          "*1000,0)",
      );
    sheet
      .getRange(currentRow, 6)
      .setFormula("=SUM(F2:F" + (currentRow - 1) + ")");
    currentRow++;
  }

  // Prazan red izmedju tabela
  currentRow++;

  var ioStartRow = currentRow;

  // === TABELA 2: Insertion Order ===
  var ioHeaders = [
    "Insertion Order",
    "Impressions",
    "Clicks",
    "CTR",
    "CPM",
    "Budget",
  ];
  sheet.getRange(currentRow, 1, 1, ioHeaders.length).setValues([ioHeaders]);
  currentRow++;

  if (ioData.length > 0) {
    sheet
      .getRange(currentRow, 1, ioData.length, ioHeaders.length)
      .setValues(ioData);
    currentRow += ioData.length;

    // Total
    var ioDataStart = ioStartRow + 1;
    sheet.getRange(currentRow, 1).setValue("Total");
    sheet
      .getRange(currentRow, 2)
      .setFormula("=SUM(B" + ioDataStart + ":B" + (currentRow - 1) + ")");
    sheet
      .getRange(currentRow, 3)
      .setFormula("=SUM(C" + ioDataStart + ":C" + (currentRow - 1) + ")");
    sheet
      .getRange(currentRow, 4)
      .setFormula(
        "=IF(B" +
          currentRow +
          ">0,C" +
          currentRow +
          "/B" +
          currentRow +
          "*100,0)",
      );
    sheet
      .getRange(currentRow, 5)
      .setFormula(
        "=IF(B" +
          currentRow +
          ">0,F" +
          currentRow +
          "/B" +
          currentRow +
          "*1000,0)",
      );
    sheet
      .getRange(currentRow, 6)
      .setFormula("=SUM(F" + ioDataStart + ":F" + (currentRow - 1) + ")");
  }

  // Period sa strane
  var now = new Date();
  var firstDayPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  var monthLabel = Utilities.formatDate(
    firstDayPrev,
    Session.getScriptTimeZone(),
    "MMMM yyyy",
  );
  sheet.getRange(1, 8).setValue("Period: " + monthLabel);

  // Obrisi mail
  message.moveToTrash();
  Logger.log("Mail obrisan");

  Logger.log(
    "Sheet uspesno azuriran: " +
      campaignData.length +
      " kampanja, " +
      ioData.length +
      " insertion ordera",
  );
}

function parseNum(val) {
  if (!val) return 0;
  return parseInt(val.toString().replace(/,/g, ""), 10) || 0;
}

function objToRows(obj) {
  var rows = [];
  var keys = Object.keys(obj);
  for (var i = 0; i < keys.length; i++) {
    var d = obj[keys[i]];
    var ctr =
      d.impressions > 0
        ? ((d.clicks / d.impressions) * 100).toFixed(2) + "%"
        : "0.00%";
    var cpm = d.impressions > 0 ? (d.cost / d.impressions) * 1000 : 0;
    rows.push([
      keys[i],
      d.impressions,
      d.clicks,
      ctr,
      Math.round(cpm * 100) / 100,
      Math.round(d.cost * 100) / 100,
    ]);
  }
  // Sortiraj po impressions desc
  rows.sort(function (a, b) {
    return b[1] - a[1];
  });
  return rows;
}
